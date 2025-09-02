import { z } from 'zod';
import { Router, Request, Response, NextFunction } from 'express';
import {
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/error';
import { CreateOrderSchema, OrderQuerySchema } from '@/schema/orders';
import { OrdersService } from '@/services/orders';
import { UserRole } from '@prisma/client';
import { authorize } from '@/middlewares/authorize';
import { logger } from '@/lib/logger';
import { authenticate } from '@/middlewares/authenticate';
import { getAuthContext } from '@/lib/utils/helpers';
import { OrderApiResponse } from '@/types/orders';

/**
 * OrdersController - Handles request/response logic
 * Keeps controllers thin & delegates business logic to service layer.
 */
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private sendSuccess<T>(
    res: Response,
    data?: T,
    message?: string,
    metadata?: OrderApiResponse['metadata']
  ) {
    res.status(200).json({
      success: true,
      data,
      message,
      metadata,
    });
  }

  private sendError(res: Response, error: unknown, context: string) {
    logger.error(`${context} error:`, error);

    let statusCode = 500;
    let errorMessage = 'Internal server error';

    switch (true) {
      case error instanceof UnauthenticatedError:
        statusCode = 401;
        errorMessage = error.message;
        break;
      case error instanceof ForbiddenError:
        statusCode = 403;
        errorMessage = error.message;
        break;
      case error instanceof BadRequestError:
      case error instanceof ValidationError:
        statusCode = 400;
        errorMessage = error.message;
        break;
      case error instanceof NotFoundError:
        statusCode = 404;
        errorMessage = error.message;
        break;
      case error instanceof z.ZodError:
        statusCode = 400;
        errorMessage =
          'Validation failed: ' + error.issues.map((e) => e.message).join(', ');
        break;
      case error instanceof Error:
        errorMessage = error.message;
        break;
    }

    res.status(statusCode).json({ success: false, error: errorMessage });
  }

  private asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
  ) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        this.sendError(res, error, fn.name);
      }
    };
  }

  /**
   * Use this endpoint to create a new order
   * @param {CreateOrderInput} data - The order data
   * @returns {OrderApiResponse} - The created order
   * @throws {BadRequestError} - If the request data is invalid
   *
   */
  createOrder = this.asyncHandler(async (req: Request, res: Response) => {
    const { userId } = getAuthContext(req);
    const validatedData = CreateOrderSchema.parse(req.body);
    const order = await this.ordersService.createOrder(userId, validatedData);
    this.sendSuccess(res, order, 'Order created successfully');
  });

  routes(): Router {
    const router = Router();
    router.use(authenticate);

    router.post('/', authorize({ minRole: UserRole.USER }), this.createOrder);

    return router;
  }
}
