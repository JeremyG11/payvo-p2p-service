import { ValidationError } from '@payvo/utils';
import { ZodError } from '@payvo/utils/zod';
import type { ZodObject } from '@payvo/utils/zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware to validate request data using a provided Zod schema.
 *
 * This middleware validates the body, query, params, and headers of the request based on the provided Zod schema.
 * If validation fails, it passes a structured error response to the next middleware.
 *
 * @param schema - A Zod schema object to validate against the request.
 * @param validatePart - Optional: Part of the request to validate (body, query, params, headers).
 * @returns A middleware function that validates the request and calls next() if valid. If invalid, calls next(err) with a validation error.
 */
const validator =
  (
    schema: ZodObject<any>,
    validatePart: 'body' | 'query' | 'params' | 'headers' = 'body'
  ) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      switch (validatePart) {
        case 'body':
          schema.parse(req.body);
          break;
        case 'query':
          schema.parse(req.query);
          break;
        case 'params':
          schema.parse(req.params);
          break;
        case 'headers':
          schema.parse(req.headers);
          break;
        default:
          throw new Error('Invalid validation part');
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new ValidationError(
            'Validation failed: ' + err.issues.map((e) => e.message).join(', ')
          )
        );
      } else {
        next(err);
      }
    }
  };

export default validator;
