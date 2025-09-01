/**
 * Standardized API error response interface.
 */
export interface ApiErrorResponse {
  success: false;
  code: ErrorType;
  message: string;
  timestamp: string;
  details?: any;
}

/**
 * Allowed error types for API responses.
 */
export type ErrorType =
  | "BadRequest"
  | "Unauthenticated"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "TooManyRequests"
  | "InternalServerError"
  | "ServiceUnavailable"
  | "VALIDATION_ERROR";

/**
 * Base class for application errors.
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: ErrorType;
  public details?: any;

  /**
   * @param message - Error message
   * @param statusCode - HTTP status code
   * @param code - Custom error type
   * @param isOperational - Flag to differentiate operational vs programmer errors
   * @param details - Additional error details
   */
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

  /**
   * Convert error instance to a standardized API response.
   */
  public toApiResponse(): ApiErrorResponse {
    return {
      success: false,
      code: this.code || "InternalServerError",
      message: this.message,
      timestamp: new Date().toISOString(),
      ...(this.details && { details: this.details }),
    };
  }
}

/** Client-side / operational errors **/

export class BadRequestError extends AppError {
  constructor(message: string = "Invalid request", details?: any) {
    super(message, 400, "BadRequest", true, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message: string = "Unauthenticated request") {
    super(message, 401, "Unauthenticated");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "Unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Insufficient permissions") {
    super(message, 403, "Forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NotFound");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Data conflict detected") {
    super(message, 409, "Conflict");
  }
}

export class TooManyRequestsError extends AppError {
  /**
   * @param message - Optional error message
   * @param details - Additional details, e.g., the time to wait before retrying
   */
  constructor(message: string = "Too many requests", details?: any) {
    super(message, 429, "TooManyRequests", true, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error") {
    super(message, 500, "InternalServerError");
  }
}

export class ValidationError extends BadRequestError {
  /**
   * @param errors - Validation errors
   * @param message - Optional error message
   */
  constructor(errors: any, message: string = "Validation failed") {
    super(message);
    this.code = "VALIDATION_ERROR";
    this.details = {
      errorCount: Array.isArray(errors) ? errors.length : 1,
      errors,
    };
  }
}

/** Non-operational / system errors **/

export class DatabaseConnectionError extends AppError {
  constructor(message: string = "Database connection failed") {
    super(message, 500, "InternalServerError", false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = "Service temporarily unavailable") {
    super(message, 503, "InternalServerError", false);
  }
}

export const errorStatusMap = {
  [UnauthenticatedError.name]: 401,
  [ForbiddenError.name]: 403,
  [UnauthorizedError.name]: 403,
  [BadRequestError.name]: 400,
  [NotFoundError.name]: 404,
  [TooManyRequestsError.name]: 429,
  [ConflictError.name]: 429,
  [InternalServerError.name]: 500,
  [ServiceUnavailableError.name]: 503,
};
