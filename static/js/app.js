import { LocationTracker } from './core/location-tracker.js';
import { CONFIG, getApiConfig } from './config.js';

// Initialize the application
let locationTracker;

document.addEventListener('DOMContentLoaded', () => {
  // Get configuration
  const apiConfig = getApiConfig();
  const fullConfig = { ...CONFIG, ...apiConfig };

  // Initialize with config
  locationTracker = new LocationTracker(fullConfig);

  // Make it globally available for HTML onclick handlers
  window.locationTracker = locationTracker;

  // CRITICAL: Start the application (loads Map, Managers, WebSocket)
  locationTracker.initializeApp();
});
