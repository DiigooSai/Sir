import { type Context } from 'hono';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

type ErrorResponse = {
  message: string;
  stack?: string;
} & Record<string, unknown>;
// Error Handler
export const errorHandler = (c: Context) => {
  console.log('error Handler called');
  const err = c.error;
  let error: ApiError;

  if (err instanceof ApiError) {
    error = err;
  } else if (err instanceof ZodError) {
    const errors = err.errors.map((issue: any) => ({
      field: issue.path.join('.'),
      errorMessage: issue.message,
    }));
    error = new ApiError(422, 'Zod Error', errors, err?.stack || '');
  } else {
    const statusCode = (err as any)?.statusCode ?? 500;
    const message = err?.message ?? 'Something went wrong';
    const errors = (err as any)?.errors ?? [];
    error = new ApiError(statusCode, message, errors, err?.stack || '');
  }

  const response: ErrorResponse = {
    ...error,
    message: error.message,
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
  };

  return c.json(response, error.statusCode || 500);
};

// Not Found Handler
export const notFound = (c: Context) => {
  return c.json({
    success: false,
    message: `Not Found - [${c.req.method}] ${c.req.url}`,
  });
};
