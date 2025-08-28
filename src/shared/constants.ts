import type {
  AppConstants,
  ApiEndpoints,
  ScraperSelectors,
  FilePatterns,
  NewlineNormalizePatterns
} from '../types/constants.js';

// Application Constants
export const APP_CONSTANTS: AppConstants = {
  // Default configuration values
  DEFAULT_MAX_CHAPTERS: 1000,
  DEFAULT_CHAPTER_DELAY: 3,
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_OUTPUT_DIR: './output',
  DEFAULT_AUDIO_DIR: './audio',
  DEFAULT_TTS_SPEED: 1.0,

  // HTTP Configuration
  HTTP_TIMEOUT: 30000, // 30 seconds
  HTTP_RETRY_DELAY: 1000, // 1 second
  HTTP_RETRY_BACKOFF_MULTIPLIER: 1.5,

  // Navigation timing
  NAVIGATION_BASE_DELAY: 1000, // 1 second
  NAVIGATION_MIN_DELAY: 500, // 0.5 second
  NAVIGATION_MAX_DELAY: 10000, // 10 seconds
  NAVIGATION_DEFAULT_DELAY: 3000, // 3 seconds

  // Translation API limits
  TRANSLATION_MAX_TOKENS: 4000,
  TRANSLATION_TEMPERATURE: 0.1,

  // TTS limits and delays
  TTS_MAX_CHUNK_SIZE: 4000, // characters
  TTS_PROCESSING_DELAY: 1000, // 1 second between chunks

  // File processing
  FILENAME_MAX_TITLE_LENGTH: 50,
  CHAPTER_NUMBER_PADDING: 3,
} as const;

// API Endpoints
export const API_ENDPOINTS: ApiEndpoints = {
  DEEPSEEK: 'https://api.deepseek.com/v1/chat/completions',
  SYOSETU_BASE: 'https://ncode.syosetu.com',
} as const;

// CSS Selectors for web scraping (NIEZMIENNIK - nie modyfikować)
export const SCRAPER_SELECTORS: ScraperSelectors = {
  TITLE_PRIMARY: '.p-novel__title',
  TITLE_FALLBACK: 'title',
  TITLE_REMOVE_PATTERN: /\s*-\s*小説家になろう$/,
  CONTENT_PRIMARY: '.js-novel-text.p-novel__text',
  CONTENT_EXCLUDE: '.p-novel__text--preface, .p-novel__text--afterword',
  CONTENT_FALLBACKS: [
    '#novel_honbun .novel_view',
    '.novel_view',
    '#novel_honbun',
    '.novel_content',
    '.l-container',
  ] as const,
  NEXT_CHAPTER_KEYWORDS: ['次へ', '次の話', '>>'] as const,
  ELEMENTS_TO_REMOVE: ['.p-novel__title', '.novel_subtitle', 'script', 'style'] as const,
} as const;

// File system patterns
const NEWLINE_NORMALIZE: NewlineNormalizePatterns = {
  CRLF_TO_LF: /\r\n/g,
  CR_TO_LF: /\r/g,
  MULTIPLE_NEWLINES: /\n{3,}/g,
  MULTIPLE_SPACES: /[ \t]+/g,
} as const;

export const FILE_PATTERNS: FilePatterns = {
  INVALID_FILENAME_CHARS: /[<>:"/\\|?*]/g,
  WHITESPACE_REPLACE: /\s+/g,
  NEWLINE_NORMALIZE,
} as const;