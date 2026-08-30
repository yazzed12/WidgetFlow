import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('API Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected internal server error occurred.';
  const code = err.code || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}
