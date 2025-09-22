import { ZodError } from 'zod';
import { logger } from '@payvo/redis';
import type { Request, Response, NextFunction } from 'express';
import { AppError, NotFoundError, ValidationError } from '@/lib/error';

/**
 * Wraps async route handlers to automatically catch errors and forward to next().
 */
export const asyncWrapper =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Middleware to handle 404 Not Found errors.
 */
export const notFoundHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next(
    new NotFoundError('The requested resource was not found on this server.')
  );
};

/**
 * Global error handler middleware.
 * Sends structured JSON responses for AppError instances.
 * Logs unexpected errors and sends generic response to clients.
 */
export const globalErrorHandler = (
  err: AppError | Error | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ZodError) {
    const validationError = new ValidationError(
      err.issues,
      'Validation failed'
    );
    res.status(validationError.statusCode).json({
      success: false,
      message: validationError.message,
      timestamp: new Date().toISOString(),
      details: validationError.details,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn(`Operational Error: ${err.message}`, {
      path: req.originalUrl,
    });

    logger.debug(err.stack, { error: err.stack || err });

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Finally, handle any unexpected or non-operational errors
  console.log(err.stack, err);
  logger.error('Unexpected Server Error:', { error: err.stack || err });

  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred.',
    timestamp: new Date().toISOString(),
  });
};
