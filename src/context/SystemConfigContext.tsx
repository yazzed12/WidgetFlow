import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import type { EmploymentStatus, SystemEffectiveConfig } from '../types';

interface SystemConfigContextType {
  config: SystemEffectiveConfig;
  isLoading: boolean;
  isFeatureEnabled: (featureKey: string) => boolean;
  isElementEnabled: (elementKey: string) => boolean;
  isSettingEnabled: (settingKey: string) => boolean;
  updateFeature: (featureKey: string, enabled: boolean) => Promise<void>;
  updateElement: (elementKey: string, enabled: boolean) => Promise<void>;
  updateUserStatus: (userId: string, status: EmploymentStatus) => Promise<void>;
  updateAdminUser: (userId: string, updates: { name?: string; email?: string; department?: string; role?: string; roleId?: string; status?: EmploymentStatus }) => Promise<void>;
  createAdminUser: (userData: { name: string; email: string; role?: string; roleId?: string; department: string }) => Promise<void>;
  createAdminCategory: (catData: { name: string; description: string }) => Promise<void>;
  updateAdminCategory: (id: string, updates: { name?: string; description?: string; status?: 'Active' | 'Inactive' }) => Promise<void>;
  updateSettings: (settings: Record<string, any>) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: SystemEffectiveConfig = {
  features: {
    'studio.templates': true,
    'studio.elements': true,
    'studio.content_library': true,
    'studio.text': true,
    'studio.sections': true,
    'studio.data_fields': true,
    'studio.themes': true,
    'studio.workflow': true,
  },
  elements: {
    'elements.text': true,
    'elements.textarea': true,
    'elements.number': true,
    'elements.currency': true,
    'elements.percentage': true,
    'elements.date': true,
    'elements.datetime': true,
    'elements.select': true,
    'elements.checkbox': true,
    'elements.radio': true,
    'elements.rating': true,
    'elements.acknowledgement': true,
    'elements.heading': true,
    'elements.paragraph': true,
    'elements.divider': true,
    'elements.spacer': true,
    'elements.image': true,
    'elements.info_box': true,
    'elements.file': true,
    'elements.signature': true,
    'elements.table': true,
    'elements.repeating_group': true,
    'elements.kpi': true,
  },
  settings: {
    org_name: 'WidgetFlow Demo Company',
    platform_name: 'WidgetFlow',
    default_template_version: '1.0',
    allow_rejection: true,
    allow_return: true,
    digital_signature: true,
    template_governance: true,
    demo_mode: true,
  },
};

const SystemConfigContext = createContext<SystemConfigContextType | undefined>(undefined);

export const SystemConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<SystemEffectiveConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  const refreshConfig = async () => {
    try {
      const data = await apiService.getSystemConfig();
      if (data && data.features && data.elements) {
        setConfig(data as SystemEffectiveConfig);
      }
    } catch {
      // Fallback to default config on error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshConfig();
  }, []);

  const isFeatureEnabled = (featureKey: string): boolean => {
    if (!featureKey) return true;
    if (config.features[featureKey] !== undefined) {
      return Boolean(config.features[featureKey]);
    }
    return true;
  };

  const isElementEnabled = (elementKey: string): boolean => {
    if (!elementKey) return true;
    if (config.elements[elementKey] !== undefined) {
      return Boolean(config.elements[elementKey]);
    }
    return true;
  };

  const isSettingEnabled = (settingKey: string): boolean => {
    if (!settingKey) return true;
    if (config.settings && config.settings[settingKey] !== undefined) {
      return Boolean(config.settings[settingKey]);
    }
    return true;
  };

  const updateFeature = async (featureKey: string, enabled: boolean) => {
    await apiService.updateFeatureSetting(featureKey, enabled);
    await refreshConfig();
  };

  const updateElement = async (elementKey: string, enabled: boolean) => {
    await apiService.updateElementSetting(elementKey, enabled);
    await refreshConfig();
  };

  const updateUserStatus = async (userId: string, status: EmploymentStatus) => {
    await apiService.updateUserStatus(userId, status);
    await refreshConfig();
  };

  const updateAdminUser = async (userId: string, updates: { name?: string; email?: string; department?: string; role?: string; roleId?: string; status?: EmploymentStatus }) => {
    await apiService.updateAdminUser(userId, updates);
  };

  const createAdminUser = async (userData: { name: string; email: string; role?: string; roleId?: string; department: string }) => {
    await apiService.createAdminUser(userData);
    await refreshConfig();
  };

  const createAdminCategory = async (catData: { name: string; description: string }) => {
    await apiService.createAdminCategory(catData);
    await refreshConfig();
  };

  const updateAdminCategory = async (id: string, updates: { name?: string; description?: string; status?: 'Active' | 'Inactive' }) => {
    await apiService.updateAdminCategory(id, updates);
    await refreshConfig();
  };

  const updateSettings = async (settings: Record<string, any>) => {
    await apiService.updateAdminSettings(settings);
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
        updateUserStatus,
        updateAdminUser,
        createAdminUser,
        createAdminCategory,
        updateAdminCategory,
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
