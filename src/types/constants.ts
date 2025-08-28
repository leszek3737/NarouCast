// Type definitions for constants

// Application constants structure
export interface AppConstants {
  // Default configuration values
  readonly DEFAULT_MAX_CHAPTERS: number;
  readonly DEFAULT_CHAPTER_DELAY: number;
  readonly DEFAULT_MAX_RETRIES: number;
  readonly DEFAULT_OUTPUT_DIR: string;
  readonly DEFAULT_AUDIO_DIR: string;
  readonly DEFAULT_TTS_SPEED: number;

  // HTTP Configuration
  readonly HTTP_TIMEOUT: number;
  readonly HTTP_RETRY_DELAY: number;
  readonly HTTP_RETRY_BACKOFF_MULTIPLIER: number;

  // Navigation timing
  readonly NAVIGATION_BASE_DELAY: number;
  readonly NAVIGATION_MIN_DELAY: number;
  readonly NAVIGATION_MAX_DELAY: number;
  readonly NAVIGATION_DEFAULT_DELAY: number;

  // Translation API limits
  readonly TRANSLATION_MAX_TOKENS: number;
  readonly TRANSLATION_TEMPERATURE: number;

  // TTS limits and delays
  readonly TTS_MAX_CHUNK_SIZE: number;
  readonly TTS_PROCESSING_DELAY: number;

  // File processing
  readonly FILENAME_MAX_TITLE_LENGTH: number;
  readonly CHAPTER_NUMBER_PADDING: number;
}

// API endpoints structure
export interface ApiEndpoints {
  readonly DEEPSEEK: string;
  readonly SYOSETU_BASE: string;
}

// Scraper selectors structure
export interface ScraperSelectors {
  readonly TITLE_PRIMARY: string;
  readonly TITLE_FALLBACK: string;
  readonly TITLE_REMOVE_PATTERN: RegExp;
  readonly CONTENT_PRIMARY: string;
  readonly CONTENT_EXCLUDE: string;
  readonly CONTENT_FALLBACKS: readonly string[];
  readonly NEXT_CHAPTER_KEYWORDS: readonly string[];
  readonly ELEMENTS_TO_REMOVE: readonly string[];
}

// File patterns structure
export interface NewlineNormalizePatterns {
  readonly CRLF_TO_LF: RegExp;
  readonly CR_TO_LF: RegExp;
  readonly MULTIPLE_NEWLINES: RegExp;
  readonly MULTIPLE_SPACES: RegExp;
}

export interface FilePatterns {
  readonly INVALID_FILENAME_CHARS: RegExp;
  readonly WHITESPACE_REPLACE: RegExp;
  readonly NEWLINE_NORMALIZE: NewlineNormalizePatterns;
}