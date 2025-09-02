import { PrismaClient, Order, OrderStatus, AdStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { BadRequestError, NotFoundError } from '@/lib/error';
import { TCreateOrderInput } from '@/schema/orders';

export class OrdersService {
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new order
   * @param {string} userId - The ID of the user creating the order
   * @param {TCreateOrderInput} data - The order data
   * @returns {Promise<Order>} - The created order
   * @throws {BadRequestError} - If the request data is invalid
   */

  public async createOrder(
    userId: string,
    data: TCreateOrderInput
  ): Promise<Order> {
    const { adId, amount, unitPrice, quantity } = data;
    const orderAmount = new Decimal(amount);

    return this.prisma.$transaction(async (tx) => {
      const ad = await this.prisma.ad.findUnique({
        where: { id: adId },
        include: {
          fiatCryptoRate: true,
          agent: true,
          acceptedPaymentMethods: {
            select: {
              paymentMethod: true,
            },
          },
        },
      });

      if (!ad) throw new NotFoundError('Ad not found');
      if (ad.status !== AdStatus.ACTIVE) {
        throw new BadRequestError('This ad is not currently active');
      }

      const minLimit = new Decimal(ad.minLimitFiat);
      const maxLimit = new Decimal(ad.maxLimitFiat);
      const available = new Decimal(ad.availableAmount);

      if (orderAmount.lessThan(minLimit)) {
        throw new BadRequestError(`Amount must be at least ${ad.minLimitFiat}`);
      }
      if (orderAmount.greaterThan(maxLimit)) {
        throw new BadRequestError(`Amount cannot exceed ${ad.maxLimitFiat}`);
      }
      if (orderAmount.greaterThan(available)) {
        throw new BadRequestError('Insufficient crypto available');
      }

      const fiatCryptoRate = await tx.fiatCryptoRate.findUnique({
        where: { id: ad.fiatCryptoRateId },
      });
      if (!fiatCryptoRate) throw new NotFoundError('FiatCryptoRate not found');

      const adRate = new Decimal(fiatCryptoRate.rawRate);
      const totalAmount = orderAmount.times(adRate);

      const order = await this.prisma.order.create({
        data: {
          customerId: userId,
          adId: ad.id,
          fiatAmount: orderAmount,
          cryptoAmount: totalAmount,
          orderNumber: userId, // Will change this later
          unitPrice: ad.fiatCryptoRate as unknown as Decimal,
          agentId: ad.agentId,
          paymentMethodId: ad.acceptedPaymentMethods[0].paymentMethod.id,
          status: OrderStatus.PENDING_AGENT_CONFIRMATION,
        },
      });

      // TODO: publish order created event
      return order;
    });
  }
}
