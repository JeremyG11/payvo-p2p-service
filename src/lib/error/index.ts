type ErrorType =
  | "BadRequest"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalServerError"
  | "VALIDATION_ERROR";

export class AppError extends Error {
  public statusCode: number;
  public isOperational?: boolean;
  public code?: ErrorType;
  public details?: any;

  constructor(
    message: string,
    statusCode: number,
    code?: ErrorType,
    isOperational = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
