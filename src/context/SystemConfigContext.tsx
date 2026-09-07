import React, { createContext, useContext, useState, useEffect } from 'react';
import { configurationService } from '../features/configuration/services/configurationService';
import type { SystemEffectiveConfig } from '../types';

interface SystemConfigContextType {
  config: SystemEffectiveConfig;
  isLoading: boolean;
  isFeatureEnabled: (featureKey: string) => boolean;
  isElementEnabled: (elementKey: string) => boolean;
  isSettingEnabled: (settingKey: string) => boolean;
  updateFeature: (featureKey: string, enabled: boolean) => Promise<void>;
  updateElement: (elementKey: string, enabled: boolean) => Promise<void>;
  updateSettings: (settings: Record<string, any>) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const EMPTY_CONFIG: SystemEffectiveConfig = {
  features: {},
  elements: {},
  settings: {
    org_name: '', platform_name: '', default_template_version: '',
    allow_rejection: false, allow_return: false, digital_signature: false,
    template_governance: false,
  },
};

const SystemConfigContext = createContext<SystemConfigContextType | undefined>(undefined);

export const SystemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<SystemEffectiveConfig>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  const refreshConfig = async () => {
    try {
      const data = await configurationService.effectiveConfig();
      if (data && data.features && data.elements) {
        setConfig(data as SystemEffectiveConfig);
      }
    } catch (error) {
      console.error('Unable to load effective system configuration:', error);
      setConfig(EMPTY_CONFIG);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshConfig();
  }, []);

  const isFeatureEnabled = (featureKey: string): boolean => {
    if (!featureKey) return false;
    if (config.features[featureKey] !== undefined) {
      return Boolean(config.features[featureKey]);
    }
    return false;
  };

  const isElementEnabled = (elementKey: string): boolean => {
    if (!elementKey) return false;
    if (config.elements[elementKey] !== undefined) {
      return Boolean(config.elements[elementKey]);
    }
    return false;
  };

  const isSettingEnabled = (settingKey: string): boolean => {
    if (!settingKey) return false;
    if (config.settings && config.settings[settingKey] !== undefined) {
      return Boolean(config.settings[settingKey]);
    }
    return false;
  };

  const updateFeature = async (featureKey: string, enabled: boolean) => {
    await configurationService.setFeature(featureKey, enabled);
    await refreshConfig();
  };

  const updateElement = async (elementKey: string, enabled: boolean) => {
    await configurationService.setElement(elementKey, enabled);
    await refreshConfig();
  };

  const updateSettings = async (settings: Record<string, any>) => {
    await configurationService.updateSettings(settings);
    await refreshConfig();
  };

  return (
    <SystemConfigContext.Provider
      value={{
        config,
        isLoading,
        isFeatureEnabled,
        isElementEnabled,
        isSettingEnabled,
        updateFeature,
        updateElement,
        updateSettings,
        refreshConfig,
      }}
    >
      {children}
    </SystemConfigContext.Provider>
  );
};

export const useSystemConfig = () => {
  const context = useContext(SystemConfigContext);
  if (!context) {
    throw new Error('useSystemConfig must be used within a SystemConfigProvider');
  }
  return context;
};
