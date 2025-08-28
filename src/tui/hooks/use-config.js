import { useState, useEffect } from 'react';
import { ConfigManager } from '../../shared/config-manager.js';

const configManager = new ConfigManager();

export function useConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const loadedConfig = await configManager.loadConfig();
      setConfig(loadedConfig);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (section, updates) => {
    try {
      const updatedConfig = await configManager.updateConfigSection(
        section,
        updates,
      );
      setConfig(updatedConfig);
      return updatedConfig;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const saveConfig = async (newConfig) => {
    try {
      await configManager.saveConfig(newConfig);
      setConfig(newConfig);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return {
    config,
    loading,
    error,
    updateConfig,
    saveConfig,
    reload: loadConfig,
  };
}
