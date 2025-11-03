// Configuration and constants
export const CONFIG = {
  mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  defaultCenter: [-74.0060, 40.7128],
  defaultZoom: 10,
  maxReconnectAttempts: 10,
  historyLimit: 50,
  deviceColors: [
    '#ef4444', '#10b981', '#3b82f6', '#f59e0b',
    '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
  ]
};

export function getApiConfig() {
  const appConfig = window.APP_CONFIG || {};
  const basePath = appConfig.basePath || '';
  
  return {
    apiBaseUrl: window.location.origin + basePath,
    wsUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${basePath}/ws`
  };
}
