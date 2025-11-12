import { OrderStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import type { Request, Response } from 'express';

import validator from '@/middlewares/validator';
import type { OrderApiResponse } from '@/types/orders';
import { authorize } from '@/middlewares/authorize';
import { asyncWrapper } from '@/middlewares/error';
import { authenticate } from '@/middlewares/authenticate';
import { ordersService, OrdersService } from '@/services/orders';
import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  OrderIdParamSchema,
  OrderQueryParamsSchema,
} from '@/schema/orders';

/**
 * Handles all HTTP requests related to Order management.
 * This includes creation, retrieval, status updates, and cancellation,
 * applying necessary authentication, authorization, and validation middleware.
 */
export class OrdersController {
  private readonly ordersService: OrdersService;

  /**
   * Initializes the OrdersController with the dependency-injected orders service.
   */
  constructor(ordersService: OrdersService) {
    this.ordersService = ordersService;
  }

  /**
   * Sends a standard success response with status 200.
   * Note: The `createOrder` method overrides this to use status 201.
   *
   * @param res The Express Response object.
   * @param data The payload data to return (optional).
   * @param message A success message (optional).
   * @param metadata Optional response metadata.
   */
  private sendSuccess<T>(
    res: Response,
    data?: T,
    message?: string,
    metadata?: OrderApiResponse['metadata']
  ) {
    res.status(200).json({ success: true, data, message, metadata });
  }

  /**
   * Creates a new Order.
   * Assumes body data has been validated by `validator(CreateOrderSchema)` middleware.
   * Responds with status 201 (Created) upon success.
   *
   * @param req The Express Request object (augmented with `req.user.sub` by auth middleware).
   * @param res The Express Response object.
   * @returns A 201 success response with the created order.
   */
  async createOrder(req: Request, res: Response) {
    const userId = req.userId!;
    const validatedData = req.body;
    const order = await this.ordersService.createOrder(userId, validatedData);

    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully',
    });
  }

  /**
   * Retrieves a single Order by its ID.
   * Assumes `orderId` parameter has been validated by `validator(OrderIdParamSchema)`.
   *
   * @param req The Express Request object (augmented with `orderId` in params).
   * @param res The Express Response object.
   * @returns A 200 success response with the order details.
   */
  async getOrderById(req: Request, res: Response) {
    const { orderId } = req.params;
    const order = await this.ordersService.getOrderById(orderId);
    this.sendSuccess(res, order, 'Order fetched successfully');
  }

  /**
   * Retrieves a list of Orders, supporting optional filtering by customer, agent, and status.
   * Assumes query parameters have been validated by `validator(OrderQueryParamsSchema)`.
   *
   * @param req The Express Request object (augmented with query parameters).
   * @param res The Express Response object.
   * @returns A 200 success response with the list of orders.
   */
  async listOrders(req: Request, res: Response) {
    const { customerId, agentId, status } = req.query;
    const filters = {
      customerId: customerId as string,
      agentId: agentId as string,
      status: status as OrderStatus,
    };
    const orders = await this.ordersService.listOrders(filters);
    this.sendSuccess(res, orders, 'Orders listed successfully');
  }

  /**
   * Updates the status of an existing Order (e.g., confirming payment).
   * Assumes parameters (`orderId`) and body data (`status` update) are validated.
   *
   * @param req The Express Request object (augmented with params and validated body).
   * @param res The Express Response object.
   * @returns A 200 success response with the updated order object.
   */
  async updateOrderStatus(req: Request, res: Response) {
    const { orderId } = req.params;
    const validatedData = req.body;
    const updatedOrder = await this.ordersService.updateOrderStatus(
      orderId,
      validatedData
    );
    this.sendSuccess(res, updatedOrder, 'Order status updated successfully');
  }

  /**
   * Cancels an existing Order.
   * Assumes `orderId` parameter has been validated.
   *
   * @param req The Express Request object (augmented with `orderId` in params).
   * @param res The Express Response object.
   * @returns A 200 success response with the cancelled order object.
   */
  async cancelOrder(req: Request, res: Response) {
    const { orderId } = req.params;
    const cancelledOrder = await this.ordersService.cancelOrder(orderId);
    this.sendSuccess(res, cancelledOrder, 'Order cancelled successfully');
  }

  /**
   * Defines and returns the Express router for all Order routes.
   * Applies global middleware (`authenticate`) and per-route middleware
   * for authorization and Zod validation.
   *
   * @returns An Express Router instance containing all order routes.
   */
  routes(): Router {
    const router = Router();
    router.use(authenticate);

    // POST /orders - Create Order
    router.post(
      '/',
      authorize({ minRole: UserRole.USER }),
      validator(CreateOrderSchema),
      asyncWrapper(this.createOrder.bind(this))
    );

    // GET /orders/:orderId - Get single Order
    router.get(
      '/:orderId',
      authorize({ minRole: UserRole.USER }),
      validator(OrderIdParamSchema, 'params'),
      asyncWrapper(this.getOrderById.bind(this))
    );

    // GET /orders - List Orders (with optional filters)
    router.get(
      '/',
      authorize({ minRole: UserRole.USER }),
      validator(OrderQueryParamsSchema, 'query'),
      asyncWrapper(this.listOrders.bind(this))
    );

    // PATCH /orders/:orderId/status - Update Order Status
    router.patch(
      '/:orderId/status',
      authorize({ minRole: UserRole.USER }),
      validator(OrderIdParamSchema, 'params'),
      validator(UpdateOrderStatusSchema, 'body'),
      asyncWrapper(this.updateOrderStatus.bind(this))
    );

    // PATCH /orders/:orderId/cancel - Cancel Order
    router.patch(
      '/:orderId/cancel',
      authorize({ minRole: UserRole.USER }),
      validator(OrderIdParamSchema, 'params'),
      asyncWrapper(this.cancelOrder.bind(this))
    );

    return router;
  }
}

export const ordersController = new OrdersController(ordersService);
