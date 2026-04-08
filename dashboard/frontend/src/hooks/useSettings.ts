import { useState, useEffect, useCallback } from 'react';

// Notification permission and sending functions
const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

const sendNotification = (title: string, body: string, icon?: string) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, {
    body,
    icon: icon || '/favicon.ico',
    tag: 'server-monitor',
  });
};

export interface DashboardSettings {
  refreshInterval: number;
  metricsHistoryLimit: number;
  temperatureUnit: 'celsius' | 'fahrenheit';
  showSystemNotifications: boolean;
  autoReconnect: boolean;
  darkMode: boolean;
  compactMode: boolean;
  showGpuStats: boolean;
  showNetworkStats: boolean;
  chartSmooth: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  refreshInterval: 3,
  metricsHistoryLimit: 100,
  temperatureUnit: 'celsius',
  showSystemNotifications: true,
  autoReconnect: true,
  darkMode: true,
  compactMode: false,
  showGpuStats: true,
  showNetworkStats: true,
  chartSmooth: true,
};

export function useSettings() {
  const [settings, setSettings] = useState<DashboardSettings>(() => {
    // Initialize with localStorage settings synchronously to avoid flash
    const savedSettings = localStorage.getItem('dashboardSettings');
    if (savedSettings) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Apply dark mode to body immediately when changed
  useEffect(() => {
    document.body.classList.toggle('light-mode', !settings.darkMode);
  }, [settings.darkMode]);

  // Apply compact mode to body
  useEffect(() => {
    document.body.classList.toggle('compact-mode', settings.compactMode);
  }, [settings.compactMode]);

  const updateSetting = useCallback(<K extends keyof DashboardSettings>(
    key: K,
    value: DashboardSettings[K]
  ) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      localStorage.setItem('dashboardSettings', JSON.stringify(newSettings));
      return newSettings;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('dashboardSettings');
  }, []);

  const convertTemperature = useCallback((celsius: number): number => {
    if (settings.temperatureUnit === 'fahrenheit') {
      return (celsius * 9/5) + 32;
    }
    return celsius;
  }, [settings.temperatureUnit]);

  return {
    settings,
    updateSetting,
    resetSettings,
    convertTemperature,
    requestNotificationPermission,
    sendNotification,
  };
}

// Get current settings without hook (for non-component files)
export function getCurrentSettings(): DashboardSettings {
  const savedSettings = localStorage.getItem('dashboardSettings');
  if (savedSettings) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}