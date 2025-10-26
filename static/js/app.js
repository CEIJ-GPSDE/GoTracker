import { LocationTracker } from './core/location-tracker.js';

// Initialize the application
let locationTracker;

document.addEventListener('DOMContentLoaded', () => {
  locationTracker = new LocationTracker();
  // Make it globally available for HTML onclick handlers
  window.locationTracker = locationTracker;
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && locationTracker) {
    if (!locationTracker.wsManager.isConnected()) {
      locationTracker.wsManager.connect();
    }
  }
});
