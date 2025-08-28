// Main type definitions for the application

// Configuration types
export interface TranslatorConfig {
  provider: 'openai' | 'deepseek' | 'google';
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TTSConfig {
  provider: 'none' | 'google' | 'openai' | 'elevenlabs';
  voice: string;
  speed: number;
  apiKey?: string;
}

export interface OutputConfig {
  directory: string;
  audioDirectory: string;
}

export interface GeneralConfig {
  autoContinue: boolean;
  chapterDelay: number;
  maxChapters: number;
}

export interface AppConfig {
  translator: TranslatorConfig;
  tts: TTSConfig;
  output: OutputConfig;
  general: GeneralConfig;
}

// Content types
export interface ChapterContent {
  title: string;
  content: string;
  nextChapterUrl: string | null;
  url: string;
  chapterNumber?: number;
  seriesId?: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  language?: string;
  provider: string;
  tokensUsed?: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  duration?: number;
  provider: string;
  voice: string;
}

// Navigation types
export interface NavigationResult {
  results: ChapterContent[];
  totalChapters: number;
  startUrl: string;
  lastUrl: string | null;
}

// Parser types
export interface ParsedUrl {
  seriesId: string;
  chapterNumber: number;
  isValid: boolean;
  baseUrl?: string;
}

// Error context types
export interface ErrorContext {
  operation?: string;
  url?: string;
  chapterNumber?: number;
  step?: string;
  [key: string]: unknown;
}

// Utility types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}