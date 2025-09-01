import { z } from "zod";
import { Router, Request, Response, NextFunction } from "express";
import {
  BadRequestError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/error";
import { CreateOrderSchema, OrderQuerySchema } from "@/schema/orders";
import { OrdersService } from "@/services/order";
import { UserRole } from "@prisma/client";
import { authorize } from "@/middlewares/authorize";
import { logger } from "@/lib/logger";
import { authenticate } from "@/middlewares/authenticate";
import { getAuthContext } from "@/lib/utils/helpers";
import { OrderApiResponse } from "@/types/orders";

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
    metadata?: OrderApiResponse["metadata"]
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
    let errorMessage = "Internal server error";

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
          "Validation failed: " + error.issues.map((e) => e.message).join(", ");
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

  private validateOrderId(orderId?: string) {
    if (!orderId) throw new BadRequestError("Order ID is required");
  }

  /** User: Create a new order */
  createOrder = this.asyncHandler(async (req, res) => {
    const { userId } = getAuthContext(req);
    const validatedData = CreateOrderSchema.parse(req.body);
    const order = await this.ordersService.createOrder(userId, validatedData);
    this.sendSuccess(res, order, "Order created successfully");
  });

  /** User: Get a specific order */
  getOrder = this.asyncHandler(async (req, res) => {
    this.validateOrderId(req.params.orderId);
    const order = await this.ordersService.getOrderById(
      req.params.orderId,
      req
    );
    this.sendSuccess(res, order);
  });

  /** User: Get paginated orders with filters */
  getOrders = this.asyncHandler(async (req, res) => {
    const validated = OrderQuerySchema.safeParse(req.query);
    if (!validated.success)
      throw new BadRequestError("Invalid query parameters");

    const result = await this.ordersService.getOrders(req, validated.data);
    this.sendSuccess(res, result.data, undefined, result.pagination);
  });

  /** User: Mark order as paid */
  markOrderAsPaid = this.asyncHandler(async (req, res) => {
    this.validateOrderId(req.params.orderId);
    const updated = await this.ordersService.markOrderAsPaid(
      req.params.orderId,
      req
    );
    this.sendSuccess(res, updated, "Order marked as paid successfully");
  });

  /** Agent: Confirm order */
  agentConfirmOrder = this.asyncHandler(async (req, res) => {
    this.validateOrderId(req.params.orderId);
    const { userId } = getAuthContext(req);
    const updated = await this.ordersService.agentConfirmOrder(
      req.params.orderId,
      userId
    );
    this.sendSuccess(res, updated, "Order confirmed by agent successfully");
  });

  /** User: Cancel order */
  cancelOrder = this.asyncHandler(async (req, res) => {
    this.validateOrderId(req.params.orderId);
    const updated = await this.ordersService.cancelOrder(
      req.params.orderId,
      req
    );
    this.sendSuccess(res, updated, "Order cancelled successfully");
  });

  /** Admin: Cancel any order */
  adminCancelOrder = this.asyncHandler(async (req, res) => {
    this.validateOrderId(req.params.orderId);
    const updated = await this.ordersService.adminCancelOrder(
      req.params.orderId
    );
    this.sendSuccess(res, updated, "Order cancelled by admin successfully");
  });

  /** Register routes with RBAC */
  routes(): Router {
    const router = Router();
    router.use(authenticate);

    // User
    router.post("/", authorize({ minRole: UserRole.USER }), this.createOrder);
    router.get("/", authorize({ minRole: UserRole.USER }), this.getOrders);
    router.get(
      "/:orderId",
      authorize({ minRole: UserRole.USER }),
      this.getOrder
    );
    router.patch(
      "/:orderId/pay",
      authorize({ minRole: UserRole.USER }),
      this.markOrderAsPaid
    );
    router.patch(
      "/:orderId/cancel",
      authorize({ minRole: UserRole.USER }),
      this.cancelOrder
    );

    // Agent
    router.patch(
      "/:orderId/confirm",
      authorize({
        minRole: UserRole.AGENT,
        requiredPermissions: ["order:confirm"],
      }),
      this.agentConfirmOrder
    );

    // Admin
    router.patch(
      "/:orderId/admin-cancel",
      authorize({
        minRole: UserRole.ADMIN,
        requiredPermissions: ["order:admin-cancel"],
      }),
      this.adminCancelOrder
    );

    return router;
  }
}
