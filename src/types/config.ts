// Configuration-related type definitions

// Configuration interfaces (updated with existing structure)
export interface TranslatorConfig {
  provider: string;
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TTSConfig {
  provider: string;
  voice: string;
  speed: number;
  apiKey?: string;
}

export interface OutputConfig {
  directory: string;
  audioDirectory: string;
}

export interface GeneralConfig {
  chapterDelay: number;
  chapters: number;
}

export interface AppConfig {
  translator: TranslatorConfig;
  tts: TTSConfig;
  output: OutputConfig;
  general: GeneralConfig;
}

// Encryption related types
export interface EncryptedData {
  iv: string;
  data: string;
  tag: string;
}

// ConfigManager class interface
export interface ConfigManagerInterface {
  configDir: string;
  configPath: string;
  encryptionKeyPath: string;
  encryptionKey: Buffer | null;

  ensureConfigDir(): Promise<void>;
  getEncryptionKey(): Promise<Buffer>;
  encryptData(data: Record<string, unknown>): Promise<EncryptedData>;
  decryptData(encryptedData: EncryptedData): Promise<Record<string, unknown>>;
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  updateConfigSection(section: string, updates: Record<string, unknown>): Promise<AppConfig>;
  getConfigValue(section: string, key: string): Promise<unknown>;
  getDefaultConfig(): AppConfig;
}