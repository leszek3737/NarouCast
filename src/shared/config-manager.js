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

export class ConfigManager {
  constructor() {
    try {
      this.configDir = path.join(os.homedir(), '.syosetu-translator');
      this.configPath = path.join(this.configDir, 'config.json');
      this.encryptionKeyPath = path.join(this.configDir, '.encryption.key');
      this.encryptionKey = null;
    } catch (error) {
      throw new ConfigurationError(`Failed to initialize ConfigManager: ${error.message}`);
    }
  }

  async ensureConfigDir() {
    try {
      await fs.access(this.configDir);
    } catch (accessError) {
      try {
        await fs.mkdir(this.configDir, { recursive: true });
        console.log(`=� Created config directory: ${this.configDir}`);
      } catch (mkdirError) {
        ErrorHandler.handleError(mkdirError, { operation: 'ensureConfigDir', path: this.configDir });
        throw new FileSystemError(
          `Failed to create config directory: ${mkdirError.message}`,
          this.configDir,
          'mkdir'
        );
      }
    }
  }

  async getEncryptionKey() {
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
        console.log('= Loaded existing encryption key');
      } catch (readError) {
        if (readError instanceof ConfigurationError) {
          throw readError;
        }
        
        // Generate new key if not exists
        console.log('= Generating new encryption key');
        this.encryptionKey = crypto.randomBytes(32);
        await this.ensureConfigDir();
        
        try {
          await fs.writeFile(
            this.encryptionKeyPath,
            this.encryptionKey.toString('hex'),
            'utf8',
          );
          console.log('=� Saved new encryption key');
        } catch (writeError) {
          ErrorHandler.handleError(writeError, { operation: 'saveEncryptionKey', path: this.encryptionKeyPath });
          throw new FileSystemError(
            `Failed to save encryption key: ${writeError.message}`,
            this.encryptionKeyPath,
            'writeFile'
          );
        }
      }

      return this.encryptionKey;
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'getEncryptionKey' });
      
      if (error instanceof ConfigurationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Failed to get encryption key: ${error.message}`);
    }
  }

  async encryptData(data) {
    try {
      if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid data provided for encryption');
      }
      
      const key = await this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      
      let cipher;
      try {
        cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      } catch (cipherError) {
        throw new ConfigurationError(`Failed to create cipher: ${cipherError.message}`);
      }

      let encrypted;
      try {
        encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
      } catch (encryptError) {
        throw new ConfigurationError(`Failed to encrypt data: ${encryptError.message}`);
      }
      
      const authTag = cipher.getAuthTag();

      return {
        iv: iv.toString('hex'),
        data: encrypted,
        tag: authTag.toString('hex'),
      };
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'encryptData' });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ConfigurationError(`Data encryption failed: ${error.message}`);
    }
  }

  async decryptData(encryptedData) {
    try {
      if (!encryptedData || !encryptedData.iv || !encryptedData.data || !encryptedData.tag) {
        throw new ValidationError('Invalid encrypted data structure');
      }
      
      const key = await this.getEncryptionKey();
      
      let decipher;
      try {
        decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(encryptedData.iv, 'hex'),
        );
      } catch (decipherError) {
        throw new ConfigurationError(`Failed to create decipher: ${decipherError.message}`);
      }

      try {
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      } catch (tagError) {
        throw new ConfigurationError(`Invalid authentication tag: ${tagError.message}`);
      }

      let decrypted;
      try {
        decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
      } catch (decryptError) {
        throw new ConfigurationError('Failed to decrypt data - possibly corrupted or wrong key');
      }

      try {
        return JSON.parse(decrypted);
      } catch (parseError) {
        throw new ConfigurationError(`Failed to parse decrypted data: ${parseError.message}`);
      }
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'decryptData' });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError) {
        throw error;
      }
      
      throw new ConfigurationError(`Data decryption failed: ${error.message}`);
    }
  }

  async loadConfig() {
    try {
      await this.ensureConfigDir();
      
      let configData;
      try {
        configData = await fs.readFile(this.configPath, 'utf8');
      } catch (readError) {
        if (readError.code === 'ENOENT') {
          console.log('=� Config file not found, using defaults');
          return this.getDefaultConfig();
        }
        ErrorHandler.handleError(readError, { operation: 'loadConfig', path: this.configPath });
        throw new FileSystemError(
          `Failed to read config file: ${readError.message}`,
          this.configPath,
          'readFile'
        );
      }

      let parsedData;
      try {
        parsedData = JSON.parse(configData);
      } catch (parseError) {
        ErrorHandler.handleError(parseError, { operation: 'parseConfig', path: this.configPath });
        console.warn('� Config file corrupted, using defaults');
        return this.getDefaultConfig();
      }

      // Check if data is encrypted
      if (parsedData.iv && parsedData.data && parsedData.tag) {
        try {
          const decryptedConfig = await this.decryptData(parsedData);
          console.log('= Loaded encrypted configuration');
          return decryptedConfig;
        } catch (decryptError) {
          console.warn('� Failed to decrypt config, using defaults:', decryptError.message);
          return this.getDefaultConfig();
        }
      }

      console.log('=� Loaded plain configuration');
      return parsedData;
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'loadConfig' });
      
      if (error instanceof FileSystemError) {
        throw error;
      }
      
      console.warn('� Config loading failed, using defaults:', error.message);
      return this.getDefaultConfig();
    }
  }

  async saveConfig(config) {
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
                                 section && typeof section === 'object' && section.apiKey
                               );

      let dataToWrite;
      if (hasSensitiveData) {
        console.log('= Encrypting sensitive configuration data');
        const encryptedConfig = await this.encryptData(configToSave);
        dataToWrite = JSON.stringify(encryptedConfig, null, 2);
      } else {
        console.log('=� Saving plain configuration (no sensitive data)');
        dataToWrite = JSON.stringify(configToSave, null, 2);
      }

      try {
        await fs.writeFile(this.configPath, dataToWrite, 'utf8');
        console.log(`=� Configuration saved to: ${this.configPath}`);
      } catch (writeError) {
        ErrorHandler.handleError(writeError, { operation: 'saveConfig', path: this.configPath });
        throw new FileSystemError(
          `Failed to write config file: ${writeError.message}`,
          this.configPath,
          'writeFile'
        );
      }
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'saveConfig' });
      
      if (error instanceof ValidationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Config saving failed: ${error.message}`);
    }
  }

  getDefaultConfig() {
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
        chapterDelay: 3,
        chapters: 0,
      },
    };
  }

  async updateConfigSection(section, updates) {
    try {
      if (!section || typeof section !== 'string') {
        throw new ValidationError('Invalid section name provided');
      }
      
      if (!updates || typeof updates !== 'object') {
        throw new ValidationError('Invalid updates object provided');
      }
      
      const config = await this.loadConfig();
      
      if (!config[section]) {
        config[section] = {};
      }
      
      config[section] = { ...config[section], ...updates };
      await this.saveConfig(config);
      
      console.log(` Updated config section: ${section}`);
      return config;
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'updateConfigSection', section });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Failed to update config section '${section}': ${error.message}`);
    }
  }

  async getConfigValue(section, key) {
    try {
      if (!section || typeof section !== 'string') {
        throw new ValidationError('Invalid section name provided');
      }
      
      if (!key || typeof key !== 'string') {
        throw new ValidationError('Invalid key name provided');
      }
      
      const config = await this.loadConfig();
      return config[section]?.[key];
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'getConfigValue', section, key });
      
      if (error instanceof ValidationError || error instanceof ConfigurationError || error instanceof FileSystemError) {
        throw error;
      }
      
      throw new ConfigurationError(`Failed to get config value '${section}.${key}': ${error.message}`);
    }
  }
}