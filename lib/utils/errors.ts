// SHARED ERROR MODEL - Used across all API routes and services

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export class AppError extends Error {
  code: string;
  metadata?: any; // Phase 1: Renamed from 'details'

  constructor(code: string, message: string, metadata?: any) {
    super(message);
    this.code = code;
    this.metadata = metadata;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.metadata // Keep 'details' in API response for backward compatibility
    };
  }
}

// Common error codes
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_OPERATION: 'INVALID_OPERATION',
  INSUFFICIENT_INVENTORY: 'INSUFFICIENT_INVENTORY',
  MATERIAL_SHORTAGE: 'MATERIAL_SHORTAGE',
  INVALID_STATUS: 'INVALID_STATUS',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

// Standard error handler for API routes
export function handleApiError(error: unknown): Response {
  console.error('API Error:', error);

  if (error instanceof AppError) {
    const status = getStatusCode(error.code);
    return Response.json(error.toJSON(), { status });
  }

  // Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    return Response.json(
      {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error
      },
      { status: 400 }
    );
  }

  // Unexpected errors
  return Response.json(
    {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    },
    { status: 500 }
  );
}

function getStatusCode(code: string): number {
  switch (code) {
    case ErrorCodes.UNAUTHORIZED:
      return 401;
    case ErrorCodes.FORBIDDEN:
      return 403;
    case ErrorCodes.NOT_FOUND:
      return 404;
    case ErrorCodes.CONFLICT:
      return 409;
    case ErrorCodes.VALIDATION_ERROR:
    case ErrorCodes.INVALID_INPUT:
    case ErrorCodes.INVALID_OPERATION:
    case ErrorCodes.INSUFFICIENT_INVENTORY:
    case ErrorCodes.MATERIAL_SHORTAGE:
    case ErrorCodes.INVALID_STATUS:
    case ErrorCodes.DUPLICATE:
      return 400;
    default:
      return 500;
  }
}


