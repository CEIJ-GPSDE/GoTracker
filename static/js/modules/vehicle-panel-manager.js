export class VehiclePanelManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.panelCollapsed = false;
    this.activeVehicleId = null;
  }

  initialize() {
    this.updateVehiclePanel();
    this.setupPanelTabs();
    // Update panel every 5 seconds
    setInterval(() => this.updateVehiclePanel(), 5000);
  }

  setupPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.tracker.switchPanelTab(btn.dataset.panelTab);

        // Update content based on tab
        if (btn.dataset.panelTab === 'vehicles') {
          this.updateVehiclePanel();
        } else if (btn.dataset.panelTab === 'locations') {
          // Refresh locations list when tab is opened
          this.tracker.filterAndDisplayLocations();
        } else if (btn.dataset.panelTab === 'geofences') {
          if (this.tracker.geofenceManager) {
            this.tracker.geofenceManager.updatePanelGeofenceList();
          }
        } else if (btn.dataset.panelTab === 'routes') {
          if (this.tracker.routeManager) {
            this.tracker.routeManager.updatePanelRouteList();
          }
        }
      });
    });
  }

  toggleVehiclePanel() {
    // Deprecated - now uses unified sliding panel
    this.tracker.toggleSlidingPanel();
  }

  updateVehiclePanel() {
    const container = document.getElementById('vehicle-list-panel');

    if (!container) {
      console.debug('Vehicle list panel not found - skipping update');
      return;
    }

    if (this.tracker.devices.size === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
          <div style="font-size: 48px; margin-bottom: 16px;">🚗</div>
          <p style="margin: 0; font-size: 14px;">${this.tracker.t('noDevicesFound')}</p>
        </div>
      `;
      return;
    }

    const vehiclesByStatus = new Map();

    this.tracker.devices.forEach((info, deviceId) => {
      const latestLocation = this.getLatestLocationForDevice(deviceId);
      const isOnline = latestLocation && this.isVehicleOnline(latestLocation.timestamp);

      vehiclesByStatus.set(deviceId, {
        info,
        location: latestLocation,
        online: isOnline
      });
    });

    const sortedVehicles = Array.from(vehiclesByStatus.entries())
      .sort(([, a], [, b]) => {
        if (a.online !== b.online) return b.online - a.online;
        if (!a.location || !b.location) return 0;
        return new Date(b.location.timestamp) - new Date(a.location.timestamp);
      });

    container.innerHTML = sortedVehicles.map(([deviceId, data]) => {
      const { info, location, online } = data;
      const isActive = deviceId === this.activeVehicleId;

      // ✅ ADD VISIBILITY TOGGLE CHECKBOX
      return `
        <div class="vehicle-item ${isActive ? 'active' : ''} ${!info.visible ? 'dimmed' : ''}"
            onclick="window.locationTracker.vehiclePanelManager.selectVehicle('${deviceId}')">
          <div class="vehicle-item-header">
            <input type="checkbox"
                  class="vehicle-visibility-checkbox"
                  ${info.visible ? 'checked' : ''}
                  onclick="event.stopPropagation(); window.locationTracker.deviceManager.toggleDeviceVisibility('${deviceId}', this.checked)"
                  title="${info.visible ? 'Hide device' : 'Show device'}">
            <div class="vehicle-color-indicator" style="background: ${info.color};"></div>
            <div class="vehicle-item-title">${deviceId}</div>
            <div class="vehicle-item-status ${online ? 'online' : 'offline'}">
              ${online ? '● Online' : '○ Offline'}
            </div>
          </div>

          ${location ? `
            <div class="vehicle-item-details">
              <div><strong>${this.tracker.t('coordinates')}:</strong></div>
              <div class="vehicle-item-coords">
                ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
              </div>
              <div style="margin-top: 8px;">
                <strong>${this.tracker.t('lastUpdate')}:</strong><br>
                ${this.formatTimestamp(location.timestamp)}
              </div>
            </div>

            <div class="vehicle-item-actions">
              <button class="vehicle-action-btn" onclick="event.stopPropagation(); window.locationTracker.vehiclePanelManager.centerOnVehicle('${deviceId}')">
                🎯 ${this.tracker.t('centerOnMap') || 'Center'}
              </button>
              <button class="vehicle-action-btn secondary" onclick="event.stopPropagation(); window.locationTracker.vehiclePanelManager.showVehicleHistory('${deviceId}')">
                📜 ${this.tracker.t('history') || 'History'}
              </button>
            </div>
          ` : `
            <div class="vehicle-item-details" style="color: #9ca3af; font-style: italic;">
              ${this.tracker.t('noDataAvailable') || 'No data available'}
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  getLatestLocationForDevice(deviceId) {
    const locations = this.tracker.isHistoryMode
      ? this.tracker.filteredLocations
      : this.tracker.locations;

    return locations.find(loc => loc.device_id === deviceId);
  }

  isVehicleOnline(timestamp) {
    const now = new Date();
    const lastUpdate = new Date(timestamp);
    const diffMinutes = (now - lastUpdate) / 1000 / 60;
    return diffMinutes < 5; // Online if updated within last 5 minutes
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return this.tracker.t('justNow') || 'Just now';
    if (diffMins < 60) return `${diffMins} ${this.tracker.t('minutesAgo') || 'min ago'}`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ${this.tracker.t('hoursAgo') || 'hours ago'}`;

    return date.toLocaleString();
  }

  selectVehicle(deviceId) {
    this.activeVehicleId = deviceId;
    this.updateVehiclePanel();
    this.centerOnVehicle(deviceId);
  }

  centerOnVehicle(deviceId) {
    const location = this.getLatestLocationForDevice(deviceId);
    if (location) {
      this.tracker.mapManager.centerMapOnLocation(location);

      // Open marker popup
      const marker = this.tracker.mapManager.markers.get(deviceId);
      if (marker) {
        marker.togglePopup();
      }
    }
  }

  showVehicleHistory(deviceId) {
    // Switch to device in legend/visibility
    const deviceInfo = this.tracker.devices.get(deviceId);
    if (deviceInfo && !deviceInfo.visible) {
      this.tracker.deviceManager.toggleDeviceVisibility(deviceId, true);
    }

    // ✅ FIX: Open sliding panel and switch to locations tab instead of old popup
    const panel = document.getElementById('sliding-panel');
    if (panel) {
      if (!this.tracker.slidingPanelOpen) {
        this.tracker.toggleSlidingPanel();
      }
      this.tracker.switchPanelTab('locations');
    }
  }
}
