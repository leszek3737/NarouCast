import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  ScrapingError,
  TranslationError,
  TTSError,
  ValidationError,
  ConfigurationError,
  FileSystemError,
  NetworkError,
  ProcessingError,
  ErrorHandler,
  asyncHandler,
  withRetry,
} from '../../src/shared/errors.js';

describe('AppError (Base Class)', () => {
  it('should create basic AppError with default values', () => {
    const error = new AppError('Test message');
    
    assert.equal(error.message, 'Test message');
    assert.equal(error.name, 'AppError');
    assert.equal(error.code, 'GENERIC_ERROR');
    assert.equal(error.statusCode, 500);
    assert.equal(error.isOperational, true);
    assert.ok(error.timestamp);
    assert.ok(error instanceof Error);
  });

  it('should create AppError with custom parameters', () => {
    const error = new AppError('Custom message', 'CUSTOM_CODE', 400, false);
    
    assert.equal(error.message, 'Custom message');
    assert.equal(error.code, 'CUSTOM_CODE');
    assert.equal(error.statusCode, 400);
    assert.equal(error.isOperational, false);
  });

  it('should serialize to JSON correctly', () => {
    const error = new AppError('Test message', 'TEST_CODE', 400);
    const json = error.toJSON();
    
    assert.equal(json.name, 'AppError');
    assert.equal(json.message, 'Test message');
    assert.equal(json.code, 'TEST_CODE');
    assert.equal(json.statusCode, 400);
    assert.equal(json.isOperational, true);
    assert.ok(json.timestamp);
  });
});

describe('Specific Error Classes', () => {
  it('ScrapingError should have correct defaults and URL', () => {
    const error = new ScrapingError('Scraping failed', 'https://test.com');
    
    assert.equal(error.name, 'ScrapingError');
    assert.equal(error.message, 'Scraping failed');
    assert.equal(error.code, 'SCRAPING_ERROR');
    assert.equal(error.statusCode, 400);
    assert.equal(error.url, 'https://test.com');
    assert.ok(error instanceof AppError);
  });

  it('TranslationError should have correct defaults and provider', () => {
    const error = new TranslationError('Translation failed', 'deepseek');
    
    assert.equal(error.name, 'TranslationError');
    assert.equal(error.code, 'TRANSLATION_ERROR');
    assert.equal(error.statusCode, 502);
    assert.equal(error.provider, 'deepseek');
  });

  it('TTSError should have correct defaults and provider', () => {
    const error = new TTSError('TTS failed', 'google');
    
    assert.equal(error.name, 'TTSError');
    assert.equal(error.code, 'TTS_ERROR');
    assert.equal(error.statusCode, 502);
    assert.equal(error.provider, 'google');
  });

  it('ValidationError should have correct defaults and field', () => {
    const error = new ValidationError('Invalid input', 'email');
    
    assert.equal(error.name, 'ValidationError');
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.statusCode, 400);
    assert.equal(error.field, 'email');
  });

  it('ConfigurationError should have correct defaults and configField', () => {
    const error = new ConfigurationError('Config missing', 'apiKey');
    
    assert.equal(error.name, 'ConfigurationError');
    assert.equal(error.code, 'CONFIGURATION_ERROR');
    assert.equal(error.statusCode, 500);
    assert.equal(error.configField, 'apiKey');
  });

  it('FileSystemError should have correct defaults and additional fields', () => {
    const error = new FileSystemError('File not found', '/path/to/file', 'read');
    
    assert.equal(error.name, 'FileSystemError');
    assert.equal(error.code, 'FILESYSTEM_ERROR');
    assert.equal(error.statusCode, 500);
    assert.equal(error.path, '/path/to/file');
    assert.equal(error.operation, 'read');
  });

  it('NetworkError should have correct defaults and URL', () => {
    const error = new NetworkError('Connection failed', 'https://api.test.com', 503);
    
    assert.equal(error.name, 'NetworkError');
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.statusCode, 503);
    assert.equal(error.url, 'https://api.test.com');
  });

  it('ProcessingError should have correct defaults and step', () => {
    const error = new ProcessingError('Processing failed', 'validation');
    
    assert.equal(error.name, 'ProcessingError');
    assert.equal(error.code, 'PROCESSING_ERROR');
    assert.equal(error.statusCode, 500);
    assert.equal(error.step, 'validation');
  });
});

describe('ErrorHandler', () => {
  it('isOperationalError should correctly identify operational errors', () => {
    const operationalError = new AppError('Test', 'TEST', 400, true);
    const nonOperationalError = new AppError('Test', 'TEST', 500, false);
    const standardError = new Error('Standard error');

    assert.equal(ErrorHandler.isOperationalError(operationalError), true);
    assert.equal(ErrorHandler.isOperationalError(nonOperationalError), false);
    assert.equal(ErrorHandler.isOperationalError(standardError), false);
  });

  it('handleError should process AppError correctly', () => {
    const error = new ValidationError('Invalid input', 'email');
    const context = { operation: 'user-validation' };
    
    const errorInfo = ErrorHandler.handleError(error, context);
    
    assert.equal(errorInfo.message, 'Invalid input');
    assert.equal(errorInfo.code, 'VALIDATION_ERROR');
    assert.equal(errorInfo.statusCode, 400);
    assert.equal(errorInfo.isOperational, true);
    assert.equal(errorInfo.context, context);
    assert.ok(errorInfo.timestamp);
    assert.ok(errorInfo.stack);
  });

  it('handleError should process standard Error correctly', () => {
    const error = new Error('Standard error');
    const context = { operation: 'test' };
    
    const errorInfo = ErrorHandler.handleError(error, context);
    
    assert.equal(errorInfo.message, 'Standard error');
    assert.equal(errorInfo.context, context);
    assert.ok(errorInfo.timestamp);
    assert.ok(errorInfo.stack);
    assert.equal(errorInfo.code, undefined);
  });

  it('createSafeError should return operational error details', () => {
    const operationalError = new ValidationError('Invalid email format', 'email');
    const safeError = ErrorHandler.createSafeError(operationalError);
    
    assert.equal(safeError.message, 'Invalid email format');
    assert.equal(safeError.code, 'VALIDATION_ERROR');
  });

  it('createSafeError should return generic message for non-operational errors', () => {
    const nonOperationalError = new AppError('Internal error', 'INTERNAL', 500, false);
    const safeError = ErrorHandler.createSafeError(nonOperationalError, 'Custom fallback');
    
    assert.equal(safeError.message, 'Custom fallback');
    assert.equal(safeError.code, 'INTERNAL_ERROR');
  });

  it('createSafeError should handle standard errors', () => {
    const standardError = new Error('Database connection failed');
    const safeError = ErrorHandler.createSafeError(standardError);
    
    assert.equal(safeError.message, 'An unexpected error occurred');
    assert.equal(safeError.code, 'INTERNAL_ERROR');
  });
});

describe('asyncHandler', () => {
  it('should return result when function succeeds', async () => {
    const testFunction = async (value) => value * 2;
    const wrappedFunction = asyncHandler(testFunction);
    
    const result = await wrappedFunction(5);
    assert.equal(result, 10);
  });

  it('should re-throw operational errors as-is', async () => {
    const testFunction = async () => {
      throw new ValidationError('Invalid input', 'email');
    };
    const wrappedFunction = asyncHandler(testFunction);
    
    await assert.rejects(
      wrappedFunction(),
      (error) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.message, 'Invalid input');
        assert.equal(error.field, 'email');
        return true;
      }
    );
  });

  it('should wrap non-operational errors in AppError', async () => {
    const testFunction = async () => {
      throw new Error('Unexpected database error');
    };
    const wrappedFunction = asyncHandler(testFunction);
    
    await assert.rejects(
      wrappedFunction(),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.ok(error.message.includes('Unexpected error'));
        assert.ok(error.message.includes('testFunction'));
        assert.equal(error.code, 'UNEXPECTED_ERROR');
        assert.equal(error.isOperational, false);
        return true;
      }
    );
  });
});

describe('withRetry', () => {
  it('should return result on first successful attempt', async () => {
    const operation = async () => 'success';
    
    const result = await withRetry(operation, 3, 10);
    assert.equal(result, 'success');
  });

  it('should retry operational errors and eventually succeed', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new NetworkError('Connection failed');
      }
      return 'success after retries';
    };
    
    const result = await withRetry(operation, 3, 10);
    assert.equal(result, 'success after retries');
    assert.equal(attempts, 3);
  });

  it('should retry network errors (ENOTFOUND)', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 2) {
        const error = new Error('Network error');
        error.code = 'ENOTFOUND';
        throw error;
      }
      return 'success';
    };
    
    const result = await withRetry(operation, 3, 10);
    assert.equal(result, 'success');
    assert.equal(attempts, 2);
  });

  it('should not retry non-operational errors', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      throw new AppError('Internal error', 'INTERNAL', 500, false);
    };
    
    await assert.rejects(
      withRetry(operation, 3, 10),
      (error) => {
        assert.ok(error instanceof ProcessingError);
        assert.ok(error.message.includes('Operation failed after 3 attempts'));
        return true;
      }
    );
    
    assert.equal(attempts, 1);
  });

  it('should throw ProcessingError after max retries exceeded', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      throw new NetworkError('Always failing');
    };
    
    await assert.rejects(
      withRetry(operation, 2, 10, 1.5, { operation: 'test-retry' }),
      (error) => {
        assert.ok(error instanceof ProcessingError);
        assert.ok(error.message.includes('Operation failed after 2 attempts'));
        assert.ok(error.message.includes('Always failing'));
        assert.equal(error.step, 'test-retry');
        return true;
      }
    );
    
    assert.equal(attempts, 2);
  });

  it('should use exponential backoff delays', async () => {
    const delays = [];
    const originalSetTimeout = setTimeout;
    
    // Mock setTimeout to capture delays
    global.setTimeout = (callback, delay) => {
      delays.push(delay);
      return originalSetTimeout(callback, 1); // Fast execution for tests
    };
    
    try {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts <= 3) {
          throw new NetworkError('Keep failing');
        }
        return 'success';
      };
      
      await withRetry(operation, 4, 100, 2.0);
      
      // Check exponential backoff: 100ms, 200ms, 400ms
      assert.equal(delays.length, 3);
      assert.equal(delays[0], 100);
      assert.equal(delays[1], 200);
      assert.equal(delays[2], 400);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });
});