import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : 'An unexpected internal server error occurred.';
  const code = isAppError ? err.code : 'INTERNAL_ERROR';
  if (!isAppError || statusCode >= 500) console.error('API Error:', err);

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}
