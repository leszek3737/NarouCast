// Application Error Classes
export class AppError extends Error {
  constructor(message, code = 'GENERIC_ERROR', statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Capture stack trace (excluding constructor call)
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
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
  constructor(message, url = null) {
    super(message, 'SCRAPING_ERROR', 400);
    this.url = url;
  }
}

export class TranslationError extends AppError {
  constructor(message, provider = null) {
    super(message, 'TRANSLATION_ERROR', 502);
    this.provider = provider;
  }
}

export class TTSError extends AppError {
  constructor(message, provider = null) {
    super(message, 'TTS_ERROR', 502);
    this.provider = provider;
  }
}

export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

export class ConfigurationError extends AppError {
  constructor(message, configField = null) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.configField = configField;
  }
}

export class FileSystemError extends AppError {
  constructor(message, path = null, operation = null) {
    super(message, 'FILESYSTEM_ERROR', 500);
    this.path = path;
    this.operation = operation;
  }
}

export class NetworkError extends AppError {
  constructor(message, url = null, statusCode = 500) {
    super(message, 'NETWORK_ERROR', statusCode);
    this.url = url;
  }
}

export class ProcessingError extends AppError {
  constructor(message, step = null) {
    super(message, 'PROCESSING_ERROR', 500);
    this.step = step;
  }
}

// Error handling utilities
export class ErrorHandler {
  static isOperationalError(error) {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  static handleError(error, context = {}) {
    const errorInfo = {
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
      code: error.code || 'UNKNOWN',
      context: context.operation || 'unknown',
      timestamp: errorInfo.timestamp,
    });

    // In development, log full stack trace
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }

    return errorInfo;
  }

  static createSafeError(error, fallbackMessage = 'An unexpected error occurred') {
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
export function asyncHandler(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Re-throw operational errors as-is
      if (ErrorHandler.isOperationalError(error)) {
        throw error;
      }

      // Wrap non-operational errors
      throw new AppError(
        `Unexpected error in ${fn.name}: ${error.message}`,
        'UNEXPECTED_ERROR',
        500,
        false,
      );
    }
  };
}

// Retry wrapper with exponential backoff
export async function withRetry(
  operation,
  maxRetries = 3,
  baseDelay = 1000,
  backoffMultiplier = 1.5,
  context = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry if not first attempt
      if (attempt > 1) {
        console.log(`✓ Retry successful on attempt ${attempt}/${maxRetries}`, context);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      const shouldRetry = 
        attempt < maxRetries && 
        (ErrorHandler.isOperationalError(error) || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET');

      if (!shouldRetry) {
        break;
      }

      const delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
      console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  const errorMessage = `Operation failed after ${maxRetries} attempts: ${lastError.message}`;
  throw new ProcessingError(errorMessage, context.operation || 'unknown');
}