import { AppError } from '@/lib/error';
import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: AppError | Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === 'production';

  const statusCode = ('statusCode' in err && (err as any).statusCode) || 500;
  const message = err.message || 'Something went wrong!';
  const details =
    err instanceof AppError && 'details' in err
      ? (err as AppError).details
      : null;
  const stack = !isProduction ? err.stack : undefined;

  res.status(statusCode).json({
    status: 'error',
    message,
    details,
    stack,
  });
};
