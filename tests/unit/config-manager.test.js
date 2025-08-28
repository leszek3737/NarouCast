import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ConfigManager } from '../../src/shared/config-manager.js';
import {
  ConfigurationError,
  FileSystemError,
  ValidationError,
} from '../../src/shared/errors.js';

describe('ConfigManager', () => {
  let configManager;
  let testConfigDir;

  beforeEach(async () => {
    // Create a temporary test directory
    testConfigDir = path.join(os.tmpdir(), `test-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    // Create config manager and override paths for testing
    configManager = new ConfigManager();
    configManager.configDir = testConfigDir;
    configManager.configPath = path.join(testConfigDir, 'config.json');
    configManager.encryptionKeyPath = path.join(testConfigDir, '.encryption.key');
    configManager.encryptionKey = null;
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    it('should initialize with correct default paths', () => {
      const cm = new ConfigManager();
      const expectedConfigDir = path.join(os.homedir(), '.syosetu-translator');
      
      assert.equal(cm.configDir, expectedConfigDir);
      assert.equal(cm.configPath, path.join(expectedConfigDir, 'config.json'));
      assert.equal(cm.encryptionKeyPath, path.join(expectedConfigDir, '.encryption.key'));
      assert.equal(cm.encryptionKey, null);
    });
  });

  describe('ensureConfigDir', () => {
    it('should create config directory if it does not exist', async () => {
      await configManager.ensureConfigDir();
      
      const stats = await fs.stat(testConfigDir);
      assert.ok(stats.isDirectory());
    });

    it('should not fail if directory already exists', async () => {
      await fs.mkdir(testConfigDir, { recursive: true });
      
      // Should not throw
      await configManager.ensureConfigDir();
      
      const stats = await fs.stat(testConfigDir);
      assert.ok(stats.isDirectory());
    });

    it('should throw FileSystemError if cannot create directory', async () => {
      // Make parent directory read-only to prevent creation
      const readOnlyParent = path.join(os.tmpdir(), 'readonly-test');
      await fs.mkdir(readOnlyParent, { recursive: true });
      await fs.chmod(readOnlyParent, 0o444);
      
      configManager.configDir = path.join(readOnlyParent, 'cannot-create');
      configManager.configPath = path.join(configManager.configDir, 'config.json');
      configManager.encryptionKeyPath = path.join(configManager.configDir, '.encryption.key');

      try {
        await assert.rejects(
          configManager.ensureConfigDir(),
          (error) => {
            assert.ok(error instanceof FileSystemError);
            assert.ok(error.message.includes('Failed to create config directory'));
            assert.equal(error.operation, 'mkdir');
            return true;
          }
        );
      } finally {
        // Cleanup
        await fs.chmod(readOnlyParent, 0o755);
        await fs.rm(readOnlyParent, { recursive: true, force: true });
      }
    });
  });

  describe('getEncryptionKey', () => {
    it('should return cached key if already loaded', async () => {
      const testKey = crypto.randomBytes(32);
      configManager.encryptionKey = testKey;
      
      const result = await configManager.getEncryptionKey();
      assert.deepEqual(result, testKey);
    });

    it('should load existing key from file', async () => {
      const testKey = crypto.randomBytes(32);
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(configManager.encryptionKeyPath, testKey.toString('hex'), 'utf8');
      
      const result = await configManager.getEncryptionKey();
      assert.deepEqual(result, testKey);
      assert.deepEqual(configManager.encryptionKey, testKey);
    });

    it('should generate and save new key if file does not exist', async () => {
      const result = await configManager.getEncryptionKey();
      
      assert.ok(Buffer.isBuffer(result));
      assert.equal(result.length, 32);
      
      // Verify key was saved
      const savedKey = await fs.readFile(configManager.encryptionKeyPath, 'utf8');
      assert.equal(savedKey, result.toString('hex'));
    });

    it('should throw ConfigurationError for invalid key format', async () => {
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(configManager.encryptionKeyPath, 'invalid-key-too-short', 'utf8');
      
      await assert.rejects(
        configManager.getEncryptionKey(),
        (error) => {
          assert.ok(error instanceof ConfigurationError);
          assert.equal(error.message, 'Invalid encryption key format');
          return true;
        }
      );
    });

    it('should throw FileSystemError if cannot save new key', async () => {
      // Create read-only directory
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.chmod(testConfigDir, 0o444);
      
      try {
        await assert.rejects(
          configManager.getEncryptionKey(),
          (error) => {
            assert.ok(error instanceof FileSystemError);
            assert.ok(error.message.includes('Failed to save encryption key'));
            assert.equal(error.operation, 'writeFile');
            return true;
          }
        );
      } finally {
        await fs.chmod(testConfigDir, 0o755);
      }
    });
  });

  describe('encryptData', () => {
    it('should encrypt valid object data', async () => {
      const testData = { apiKey: 'secret-key', provider: 'test' };
      
      const result = await configManager.encryptData(testData);
      
      assert.ok(result.iv);
      assert.ok(result.data);
      assert.ok(result.tag);
      assert.equal(typeof result.iv, 'string');
      assert.equal(typeof result.data, 'string');
      assert.equal(typeof result.tag, 'string');
      assert.equal(result.iv.length, 32); // 16 bytes = 32 hex chars
    });

    it('should throw ValidationError for invalid data', async () => {
      await assert.rejects(
        configManager.encryptData(null),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid data provided for encryption');
          return true;
        }
      );

      await assert.rejects(
        configManager.encryptData('string-data'),
        ValidationError
      );

      await assert.rejects(
        configManager.encryptData(123),
        ValidationError
      );
    });

    it('should create different encrypted results for same data', async () => {
      const testData = { secret: 'test' };
      
      const result1 = await configManager.encryptData(testData);
      const result2 = await configManager.encryptData(testData);
      
      // Should have different IVs and encrypted data
      assert.notEqual(result1.iv, result2.iv);
      assert.notEqual(result1.data, result2.data);
      assert.notEqual(result1.tag, result2.tag);
    });
  });

  describe('decryptData', () => {
    it('should decrypt previously encrypted data', async () => {
      const testData = { apiKey: 'secret-key', provider: 'test' };
      
      const encrypted = await configManager.encryptData(testData);
      const decrypted = await configManager.decryptData(encrypted);
      
      assert.deepEqual(decrypted, testData);
    });

    it('should throw ValidationError for invalid encrypted data structure', async () => {
      await assert.rejects(
        configManager.decryptData(null),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid encrypted data structure');
          return true;
        }
      );

      await assert.rejects(
        configManager.decryptData({ iv: 'test' }), // missing data and tag
        ValidationError
      );

      await assert.rejects(
        configManager.decryptData({ data: 'test', tag: 'test' }), // missing iv
        ValidationError
      );
    });

    it('should throw ConfigurationError for corrupted data', async () => {
      const testData = { secret: 'test' };
      const encrypted = await configManager.encryptData(testData);
      
      // Corrupt the encrypted data
      encrypted.data = 'corrupted-data';
      
      await assert.rejects(
        configManager.decryptData(encrypted),
        (error) => {
          assert.ok(error instanceof ConfigurationError);
          assert.ok(error.message.includes('Failed to decrypt data'));
          return true;
        }
      );
    });

    it('should throw ConfigurationError for invalid auth tag', async () => {
      const testData = { secret: 'test' };
      const encrypted = await configManager.encryptData(testData);
      
      // Corrupt the auth tag
      encrypted.tag = 'invalid-tag';
      
      await assert.rejects(
        configManager.decryptData(encrypted),
        (error) => {
          assert.ok(error instanceof ConfigurationError);
          assert.ok(error.message.includes('Invalid authentication tag'));
          return true;
        }
      );
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid default configuration', () => {
      const defaultConfig = configManager.getDefaultConfig();
      
      assert.ok(defaultConfig.translator);
      assert.equal(defaultConfig.translator.provider, 'openai');
      assert.equal(defaultConfig.translator.apiKey, '');
      
      assert.ok(defaultConfig.tts);
      assert.equal(defaultConfig.tts.provider, 'none');
      assert.equal(defaultConfig.tts.speed, 1.0);
      
      assert.ok(defaultConfig.output);
      assert.equal(defaultConfig.output.directory, './output');
      assert.equal(defaultConfig.output.audioDirectory, './audio');
      
      assert.ok(defaultConfig.general);
      assert.equal(defaultConfig.general.autoContinue, true);
      assert.equal(defaultConfig.general.chapterDelay, 3);
      assert.equal(defaultConfig.general.maxChapters, 1000);
    });
  });

  describe('loadConfig', () => {
    it('should return default config if file does not exist', async () => {
      const config = await configManager.loadConfig();
      const defaultConfig = configManager.getDefaultConfig();
      
      assert.deepEqual(config, defaultConfig);
    });

    it('should load plain configuration from file', async () => {
      const testConfig = {
        translator: { provider: 'deepseek', apiKey: 'test-key' },
        tts: { provider: 'google' }
      };
      
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(configManager.configPath, JSON.stringify(testConfig), 'utf8');
      
      const config = await configManager.loadConfig();
      assert.deepEqual(config, testConfig);
    });

    it('should load and decrypt encrypted configuration', async () => {
      const testConfig = {
        translator: { provider: 'openai', apiKey: 'secret-key' },
        tts: { provider: 'google', apiKey: 'tts-key' }
      };
      
      const encrypted = await configManager.encryptData(testConfig);
      
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(configManager.configPath, JSON.stringify(encrypted), 'utf8');
      
      const config = await configManager.loadConfig();
      assert.deepEqual(config, testConfig);
    });

    it('should return default config if JSON parsing fails', async () => {
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(configManager.configPath, 'invalid-json', 'utf8');
      
      const config = await configManager.loadConfig();
      const defaultConfig = configManager.getDefaultConfig();
      
      assert.deepEqual(config, defaultConfig);
    });

    it('should return default config if decryption fails', async () => {
      const invalidEncrypted = {
        iv: 'invalid',
        data: 'invalid',
        tag: 'invalid'
      };
      
      await fs.mkdir(testConfigDir, { recursive: true });
      await fs.writeFile(configManager.configPath, JSON.stringify(invalidEncrypted), 'utf8');
      
      const config = await configManager.loadConfig();
      const defaultConfig = configManager.getDefaultConfig();
      
      assert.deepEqual(config, defaultConfig);
    });
  });

  describe('saveConfig', () => {
    it('should throw ValidationError for invalid config', async () => {
      await assert.rejects(
        configManager.saveConfig(null),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid config object provided');
          return true;
        }
      );

      await assert.rejects(
        configManager.saveConfig('string'),
        ValidationError
      );
    });

    it('should save plain config without sensitive data', async () => {
      const testConfig = {
        translator: { provider: 'openai' },
        tts: { provider: 'none' }
      };
      
      await configManager.saveConfig(testConfig);
      
      const savedData = await fs.readFile(configManager.configPath, 'utf8');
      const parsedData = JSON.parse(savedData);
      
      assert.deepEqual(parsedData, testConfig);
    });

    it('should encrypt config with sensitive data', async () => {
      const testConfig = {
        translator: { provider: 'openai', apiKey: 'secret-key' },
        tts: { provider: 'google' }
      };
      
      await configManager.saveConfig(testConfig);
      
      const savedData = await fs.readFile(configManager.configPath, 'utf8');
      const parsedData = JSON.parse(savedData);
      
      // Should be encrypted (has iv, data, tag structure)
      assert.ok(parsedData.iv);
      assert.ok(parsedData.data);
      assert.ok(parsedData.tag);
      assert.notEqual(parsedData, testConfig);
    });

    it('should encrypt config with TTS API key', async () => {
      const testConfig = {
        translator: { provider: 'openai' },
        tts: { provider: 'google', apiKey: 'tts-secret' }
      };
      
      await configManager.saveConfig(testConfig);
      
      const savedData = await fs.readFile(configManager.configPath, 'utf8');
      const parsedData = JSON.parse(savedData);
      
      // Should be encrypted
      assert.ok(parsedData.iv);
      assert.ok(parsedData.data);
      assert.ok(parsedData.tag);
    });
  });

  describe('updateConfigSection', () => {
    it('should throw ValidationError for invalid parameters', async () => {
      await assert.rejects(
        configManager.updateConfigSection(null, { test: 'value' }),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid section name provided');
          return true;
        }
      );

      await assert.rejects(
        configManager.updateConfigSection('translator', null),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid updates object provided');
          return true;
        }
      );
    });

    it('should update existing config section', async () => {
      // First save a base config
      const baseConfig = {
        translator: { provider: 'openai', apiKey: 'old-key' },
        tts: { provider: 'none' }
      };
      await configManager.saveConfig(baseConfig);
      
      // Update translator section
      const updates = { apiKey: 'new-key', model: 'gpt-4' };
      const updatedConfig = await configManager.updateConfigSection('translator', updates);
      
      assert.equal(updatedConfig.translator.provider, 'openai');
      assert.equal(updatedConfig.translator.apiKey, 'new-key');
      assert.equal(updatedConfig.translator.model, 'gpt-4');
      assert.deepEqual(updatedConfig.tts, { provider: 'none' });
    });

    it('should create new section if it does not exist', async () => {
      const updates = { customSetting: 'value' };
      const updatedConfig = await configManager.updateConfigSection('newSection', updates);
      
      assert.ok(updatedConfig.newSection);
      assert.equal(updatedConfig.newSection.customSetting, 'value');
    });
  });

  describe('getConfigValue', () => {
    it('should throw ValidationError for invalid parameters', async () => {
      await assert.rejects(
        configManager.getConfigValue(null, 'key'),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid section name provided');
          return true;
        }
      );

      await assert.rejects(
        configManager.getConfigValue('section', null),
        (error) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.message, 'Invalid key name provided');
          return true;
        }
      );
    });

    it('should return config value if exists', async () => {
      const testConfig = {
        translator: { provider: 'openai', apiKey: 'secret' },
        tts: { provider: 'google' }
      };
      await configManager.saveConfig(testConfig);
      
      const provider = await configManager.getConfigValue('translator', 'provider');
      const apiKey = await configManager.getConfigValue('translator', 'apiKey');
      
      assert.equal(provider, 'openai');
      assert.equal(apiKey, 'secret');
    });

    it('should return undefined for non-existent section or key', async () => {
      const result1 = await configManager.getConfigValue('nonexistent', 'key');
      const result2 = await configManager.getConfigValue('translator', 'nonexistent');
      
      assert.equal(result1, undefined);
      assert.equal(result2, undefined);
    });
  });
});