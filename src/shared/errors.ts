import type { 
  ErrorInfo, 
  SafeError, 
  AsyncFunction, 
  WrappedAsyncFunction,
  RetryOperation
} from '../types/errors.js';

// Application Error Classes
export class AppError extends Error {
  public override readonly name: string;
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    message: string, 
    code: string = 'GENERIC_ERROR', 
    statusCode: number = 500, 
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Capture stack trace (excluding constructor call)
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      isOperational: this.isOperational,
    };
  }
}

// Specific Error Types
export class ScrapingError extends AppError {
  public readonly url: string | null;

  constructor(message: string, url: string | null = null) {
    super(message, 'SCRAPING_ERROR', 400);
    this.url = url;
  }
}

export class TranslationError extends AppError {
  public readonly provider: string | null;

  constructor(message: string, provider: string | null = null) {
    super(message, 'TRANSLATION_ERROR', 502);
    this.provider = provider;
  }
}

export class TTSError extends AppError {
  public readonly provider: string | null;

  constructor(message: string, provider: string | null = null) {
    super(message, 'TTS_ERROR', 502);
    this.provider = provider;
  }
}

export class ValidationError extends AppError {
  public readonly field: string | null;

  constructor(message: string, field: string | null = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

export class ConfigurationError extends AppError {
  public readonly configField: string | null;

  constructor(message: string, configField: string | null = null) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.configField = configField;
  }
}

export class FileSystemError extends AppError {
  public readonly path: string | null;
  public readonly operation: string | null;

  constructor(
    message: string, 
    path: string | null = null, 
    operation: string | null = null
  ) {
    super(message, 'FILESYSTEM_ERROR', 500);
    this.path = path;
    this.operation = operation;
  }
}

export class NetworkError extends AppError {
  public readonly url: string | null;

  constructor(
    message: string, 
    url: string | null = null, 
    statusCode: number = 500
  ) {
    super(message, 'NETWORK_ERROR', statusCode);
    this.url = url;
  }
}

export class ProcessingError extends AppError {
  public readonly step: string | null;

  constructor(message: string, step: string | null = null) {
    super(message, 'PROCESSING_ERROR', 500);
    this.step = step;
  }
}

// Error handling utilities
export class ErrorHandler {
  static isOperationalError(error: Error): error is AppError {
    return error instanceof AppError && error.isOperational;
  }

  static handleError(error: Error, context: Record<string, unknown> = {}): ErrorInfo {
    const errorInfo: ErrorInfo = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context,
    };

    if (error instanceof AppError) {
      errorInfo.code = error.code;
      errorInfo.statusCode = error.statusCode;
      errorInfo.isOperational = error.isOperational;
    }

    // Log error (without exposing sensitive data)
    console.error('🚨 Application Error:', {
      message: error.message,
      code: (error as AppError).code || 'UNKNOWN',
      context: (context as any).operation || 'unknown',
      timestamp: errorInfo.timestamp,
    });

    // In development, log full stack trace
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }

    return errorInfo;
  }

  static createSafeError(
    error: Error, 
    fallbackMessage: string = 'An unexpected error occurred'
  ): SafeError {
    // Never expose internal details to user
    if (this.isOperationalError(error)) {
      return {
        message: error.message,
        code: error.code,
      };
    }

    // For non-operational errors, return generic message
    return {
      message: fallbackMessage,
      code: 'INTERNAL_ERROR',
    };
  }
}

// Async wrapper for better error handling
export function asyncHandler<T extends unknown[], R>(
  fn: AsyncFunction<T, R>
): WrappedAsyncFunction<T, R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const err = error as Error;
      // Re-throw operational errors as-is
      if (ErrorHandler.isOperationalError(err)) {
        throw err;
      }

      // Wrap non-operational errors
      throw new AppError(
        `Unexpected error in ${fn.name}: ${err.message}`,
        'UNEXPECTED_ERROR',
        500,
        false,
      );
    }
  };
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  operation: RetryOperation<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  backoffMultiplier: number = 1.5,
  context: Record<string, unknown> = {},
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry if not first attempt
      if (attempt > 1) {
        console.log(`✓ Retry successful on attempt ${attempt}/${maxRetries}`, context);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      const shouldRetry = 
        attempt < maxRetries && 
        (ErrorHandler.isOperationalError(lastError) || 
         (lastError as any).code === 'ENOTFOUND' || 
         (lastError as any).code === 'ECONNRESET');

      if (!shouldRetry) {
        break;
      }

      const delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms:`, lastError.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  const errorMessage = `Operation failed after ${maxRetries} attempts: ${lastError!.message}`;
  throw new ProcessingError(errorMessage, (context as any).operation || 'unknown');
}