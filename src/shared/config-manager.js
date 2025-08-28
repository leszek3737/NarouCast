import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.syosetu-translator');
    this.configPath = path.join(this.configDir, 'config.json');
    this.encryptionKeyPath = path.join(this.configDir, '.encryption.key');
    this.encryptionKey = null;
  }

  async ensureConfigDir() {
    try {
      await fs.access(this.configDir);
    } catch {
      await fs.mkdir(this.configDir, { recursive: true });
    }
  }

  async getEncryptionKey() {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }
    
    try {
      const keyData = await fs.readFile(this.encryptionKeyPath, 'utf8');
      this.encryptionKey = Buffer.from(keyData, 'hex');
    } catch {
      // Generate new key if not exists
      this.encryptionKey = crypto.randomBytes(32);
      await this.ensureConfigDir();
      await fs.writeFile(this.encryptionKeyPath, this.encryptionKey.toString('hex'), 'utf8');
    }
    
    return this.encryptionKey;
  }

  async encryptData(data) {
    const key = await this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('hex'),
      data: encrypted,
      tag: authTag.toString('hex')
    };
  }

  async decryptData(encryptedData) {
    try {
      const key = await this.getEncryptionKey();
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm', 
        key, 
        Buffer.from(encryptedData.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Błąd odszyfrowywania danych konfiguracji');
    }
  }

  async loadConfig() {
    try {
      await this.ensureConfigDir();
      const configData = await fs.readFile(this.configPath, 'utf8');
      const parsedData = JSON.parse(configData);
      
      // Check if data is encrypted
      if (parsedData.iv && parsedData.data && parsedData.tag) {
        return await this.decryptData(parsedData);
      }
      
      return parsedData;
    } catch (error) {
      // Return default config if file doesn't exist or decryption fails
      return this.getDefaultConfig();
    }
  }

  async saveConfig(config) {
    await this.ensureConfigDir();
    
    // Encrypt sensitive data before saving
    const configToSave = { ...config };
    
    // Encrypt API keys and sensitive information
    if (configToSave.translator?.apiKey) {
      const encryptedConfig = await this.encryptData(configToSave);
      await fs.writeFile(this.configPath, JSON.stringify(encryptedConfig, null, 2), 'utf8');
    } else {
      // Save without encryption if no sensitive data
      await fs.writeFile(this.configPath, JSON.stringify(configToSave, null, 2), 'utf8');
    }
  }

  getDefaultConfig() {
    return {
      translator: {
        provider: 'openai',
        apiKey: ''
      },
      tts: {
        provider: 'none',
        voice: '',
        speed: 1.0
      },
      output: {
        directory: './output',
        audioDirectory: './audio'
      },
      general: {
        autoContinue: true,
        chapterDelay: 3,
        maxChapters: 1000
      }
    };
  }

  async updateConfigSection(section, updates) {
    const config = await this.loadConfig();
    config[section] = { ...config[section], ...updates };
    await this.saveConfig(config);
    return config;
  }

  async getConfigValue(section, key) {
    const config = await this.loadConfig();
    return config[section]?.[key];
  }
}