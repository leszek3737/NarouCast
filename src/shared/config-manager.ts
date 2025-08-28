import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  ConfigurationError,
  FileSystemError,
  ValidationError,
  ErrorHandler,
} from './errors.js';
import type { 
  AppConfig, 
  EncryptedData, 
  ConfigManagerInterface
} from '../types/config.js';

export class ConfigManager implements ConfigManagerInterface {
  public readonly configDir: string;
  public readonly configPath: string;
  public readonly encryptionKeyPath: string;
  public encryptionKey: Buffer | null = null;

  constructor() {
    try {
      this.configDir = path.join(os.homedir(), '.syosetu-translator');
      this.configPath = path.join(this.configDir, 'config.json');
      this.encryptionKeyPath = path.join(this.configDir, '.encryption.key');
    } catch (error) {
      throw new ConfigurationError(`Failed to initialize ConfigManager: ${(error as Error).message}`);
    }
  }

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(this.configDir);
    } catch (accessError) {
      try {
        await fs.mkdir(this.configDir, { recursive: true });
        console.log(`📁 Created config directory: ${this.configDir}`);
      } catch (mkdirError) {
        ErrorHandler.handleError(mkdirError as Error, { operation: 'ensureConfigDir', path: this.configDir });
        throw new FileSystemError(
          `Failed to create config directory: ${(mkdirError as Error).message}`,
          this.configDir,
          'mkdir'
        );
      }
    }
  }

  async getEncryptionKey(): Promise<Buffer> {
    try {
      if (this.encryptionKey) {
        return this.encryptionKey;
      }

      try {
        const keyData = await fs.readFile(this.encryptionKeyPath, 'utf8');
        if (!keyData || keyData.length !== 64) { // 32 bytes = 64 hex chars
          throw new ConfigurationError('Invalid encryption key format');
        }
        this.encryptionKey = Buffer.from(keyData, 'hex');
        console.log('🔐 Loaded existing encryption key');
      } catch (readError) {
        if (readError instanceof ConfigurationError) {
          throw readError;
        }
        
        // Generate new key if not exists
        console.log('🔑 Generating new encryption key');
        this.encryptionKey = crypto.randomBytes(32);
        await this.ensureConfigDir();
        
        try {
          await fs.writeFile(
            this.encryptionKeyPath,
            this.encryptionKey.toString('hex'),
            'utf8',
          );
          console.log('💾 Saved new encryption key');
        } catch (writeError) {
          ErrorHandler.handleError(writeError as Error, { operation: 'saveEncryptionKey', path: this.encryptionKeyPath });
          throw new FileSystemError(
            `Failed to save encryption key: ${(writeError as Error).message}`,
            this.encryptionKeyPath,
            'writeFile'
          );
        }
      }

      return this.encryptionKey;
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'getEncryptionKey' });
      
      if (error instanceof ConfigurationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Failed to get encryption key: ${(error as Error).message}`);
    }
  }

  async encryptData(data: Record<string, unknown>): Promise<EncryptedData> {
    try {
      if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid data provided for encryption');
      }
      
      const key = await this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      
      let cipher: crypto.CipherGCM;
      try {
        cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      } catch (cipherError) {
        throw new ConfigurationError(`Failed to create cipher: ${(cipherError as Error).message}`);
      }

      let encrypted: string;
      try {
        encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
      } catch (encryptError) {
        throw new ConfigurationError(`Failed to encrypt data: ${(encryptError as Error).message}`);
      }
      
      const authTag = cipher.getAuthTag();

      return {
        iv: iv.toString('hex'),
        data: encrypted,
        tag: authTag.toString('hex'),
      };
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'encryptData' });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ConfigurationError(`Data encryption failed: ${(error as Error).message}`);
    }
  }

  async decryptData(encryptedData: EncryptedData): Promise<Record<string, unknown>> {
    try {
      if (!encryptedData || !encryptedData.iv || !encryptedData.data || !encryptedData.tag) {
        throw new ValidationError('Invalid encrypted data structure');
      }
      
      const key = await this.getEncryptionKey();
      
      let decipher: crypto.DecipherGCM;
      try {
        decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(encryptedData.iv, 'hex'),
        );
      } catch (decipherError) {
        throw new ConfigurationError(`Failed to create decipher: ${(decipherError as Error).message}`);
      }

      try {
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      } catch (tagError) {
        throw new ConfigurationError(`Invalid authentication tag: ${(tagError as Error).message}`);
      }

      let decrypted: string;
      try {
        decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
      } catch (decryptError) {
        throw new ConfigurationError('Failed to decrypt data - possibly corrupted or wrong key');
      }

      try {
        return JSON.parse(decrypted);
      } catch (parseError) {
        throw new ConfigurationError(`Failed to parse decrypted data: ${(parseError as Error).message}`);
      }
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'decryptData' });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ConfigurationError(`Data decryption failed: ${(error as Error).message}`);
    }
  }

  async loadConfig(): Promise<AppConfig> {
    try {
      await this.ensureConfigDir();
      
      let configData: string;
      try {
        configData = await fs.readFile(this.configPath, 'utf8');
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log('📄 Config file not found, using defaults');
          return this.getDefaultConfig();
        }
        ErrorHandler.handleError(readError as Error, { operation: 'loadConfig', path: this.configPath });
        throw new FileSystemError(
          `Failed to read config file: ${(readError as Error).message}`,
          this.configPath,
          'readFile'
        );
      }

      let parsedData: Record<string, unknown>;
      try {
        parsedData = JSON.parse(configData);
      } catch (parseError) {
        ErrorHandler.handleError(parseError as Error, { operation: 'parseConfig', path: this.configPath });
        console.warn('⚠️ Config file corrupted, using defaults');
        return this.getDefaultConfig();
      }

      // Check if data is encrypted
      if (this.isEncryptedData(parsedData)) {
        try {
          const decryptedConfig = await this.decryptData(parsedData as unknown as EncryptedData);
          console.log('🔓 Loaded encrypted configuration');
          return decryptedConfig as unknown as AppConfig;
        } catch (decryptError) {
          console.warn('⚠️ Failed to decrypt config, using defaults:', (decryptError as Error).message);
          return this.getDefaultConfig();
        }
      }

      console.log('📄 Loaded plain configuration');
      return parsedData as unknown as AppConfig;
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'loadConfig' });
      
      if (error instanceof FileSystemError) {
        throw error;
      }
      
      console.warn('⚠️ Config loading failed, using defaults:', (error as Error).message);
      return this.getDefaultConfig();
    }
  }

  async saveConfig(config: AppConfig): Promise<void> {
    try {
      if (!config || typeof config !== 'object') {
        throw new ValidationError('Invalid config object provided');
      }
      
      await this.ensureConfigDir();

      // Encrypt sensitive data before saving
      const configToSave = { ...config };

      // Check if config contains sensitive data
      const hasSensitiveData = configToSave.translator?.apiKey ||
                               configToSave.tts?.apiKey ||
                               Object.values(configToSave).some(section => 
                                 section && typeof section === 'object' && (section as any).apiKey
                               );

      let dataToWrite: string;
      if (hasSensitiveData) {
        console.log('🔐 Encrypting sensitive configuration data');
        const encryptedConfig = await this.encryptData(configToSave);
        dataToWrite = JSON.stringify(encryptedConfig, null, 2);
      } else {
        console.log('📄 Saving plain configuration (no sensitive data)');
        dataToWrite = JSON.stringify(configToSave, null, 2);
      }

      try {
        await fs.writeFile(this.configPath, dataToWrite, 'utf8');
        console.log(`💾 Configuration saved to: ${this.configPath}`);
      } catch (writeError) {
        ErrorHandler.handleError(writeError as Error, { operation: 'saveConfig', path: this.configPath });
        throw new FileSystemError(
          `Failed to write config file: ${(writeError as Error).message}`,
          this.configPath,
          'writeFile'
        );
      }
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'saveConfig' });
      
      if (error instanceof ValidationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Config saving failed: ${(error as Error).message}`);
    }
  }

  getDefaultConfig(): AppConfig {
    return {
      translator: {
        provider: 'openai',
        apiKey: '',
      },
      tts: {
        provider: 'none',
        voice: '',
        speed: 1.0,
      },
      output: {
        directory: './output',
        audioDirectory: './audio',
      },
      general: {
        autoContinue: true,
        chapterDelay: 3,
        maxChapters: 1000,
      },
    };
  }

  async updateConfigSection(section: string, updates: Record<string, unknown>): Promise<AppConfig> {
    try {
      if (!section || typeof section !== 'string') {
        throw new ValidationError('Invalid section name provided');
      }
      
      if (!updates || typeof updates !== 'object') {
        throw new ValidationError('Invalid updates object provided');
      }
      
      const config = await this.loadConfig();
      
      if (!(config as any)[section]) {
        (config as any)[section] = {};
      }
      
      (config as any)[section] = { ...(config as any)[section], ...updates };
      await this.saveConfig(config);
      
      console.log(`✓ Updated config section: ${section}`);
      return config;
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'updateConfigSection', section });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Failed to update config section '${section}': ${(error as Error).message}`);
    }
  }

  async getConfigValue(section: string, key: string): Promise<unknown> {
    try {
      if (!section || typeof section !== 'string') {
        throw new ValidationError('Invalid section name provided');
      }
      
      if (!key || typeof key !== 'string') {
        throw new ValidationError('Invalid key name provided');
      }
      
      const config = await this.loadConfig();
      return (config as any)[section]?.[key];
    } catch (error) {
      ErrorHandler.handleError(error as Error, { operation: 'getConfigValue', section, key });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Failed to get config value '${section}.${key}': ${(error as Error).message}`);
    }
  }

  private isEncryptedData(data: Record<string, unknown>): boolean {
    return typeof data === 'object' && data !== null &&
           'iv' in data && typeof data.iv === 'string' &&
           'data' in data && typeof data.data === 'string' &&
           'tag' in data && typeof data.tag === 'string';
  }
}