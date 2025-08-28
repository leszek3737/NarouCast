// Error-related type definitions

export interface ErrorInfo {
  message: string;
  stack?: string;
  timestamp: string;
  context: Record<string, unknown>;
  code?: string;
  statusCode?: number;
  isOperational?: boolean;
}

export interface SafeError {
  message: string;
  code: string;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  backoffMultiplier: number;
  context: Record<string, unknown>;
}

// Error class constructor types
export interface AppErrorConstructor {
  message: string;
  code?: string;
  statusCode?: number;
  isOperational?: boolean;
}

export interface ScrapingErrorConstructor {
  message: string;
  url?: string | null;
}

export interface TranslationErrorConstructor {
  message: string;
  provider?: string | null;
}

export interface TTSErrorConstructor {
  message: string;
  provider?: string | null;
}

export interface ValidationErrorConstructor {
  message: string;
  field?: string | null;
}

export interface ConfigurationErrorConstructor {
  message: string;
  configField?: string | null;
}

export interface FileSystemErrorConstructor {
  message: string;
  path?: string | null;
  operation?: string | null;
}

export interface NetworkErrorConstructor {
  message: string;
  url?: string | null;
  statusCode?: number;
}

export interface ProcessingErrorConstructor {
  message: string;
  step?: string | null;
}

// Async handler types
export type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;
export type WrappedAsyncFunction<T extends unknown[], R> = AsyncFunction<T, R>;

// Retry operation type
export type RetryOperation<T> = () => Promise<T>;