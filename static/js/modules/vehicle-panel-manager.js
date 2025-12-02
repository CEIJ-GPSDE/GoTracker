export class VehiclePanelManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.activeVehicleId = null;
    this.isSettingsOpen = false;
    this.isHistoryViewOpen = false;
  }

  initialize() {
    this.updateVehiclePanel();
    this.setupPanelTabs();
    setInterval(() => {
      if (!this.isSettingsOpen && !this.isHistoryViewOpen) {
        this.updateVehiclePanel();
      }
    }, 5000);
  }

  setupPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // Hide settings if open
        this.isSettingsOpen = false;
        this.isHistoryViewOpen = false;
        document.getElementById('settings-panel-content').style.display = 'none';
        document.querySelector('.settings-toggle-btn').classList.remove('active');

        // Show tab content
        this.tracker.switchPanelTab(btn.dataset.panelTab);

        if (btn.dataset.panelTab === 'vehicles') {
          this.updateVehiclePanel();
        } else if (btn.dataset.panelTab === 'geofences' && this.tracker.geofenceManager) {
          this.tracker.geofenceManager.updatePanelGeofenceList();
        } else if (btn.dataset.panelTab === 'routes' && this.tracker.routeManager) {
          this.tracker.routeManager.updatePanelRouteList();
        }
      });
    });
  }

  toggleSettings() {
    this.isSettingsOpen = !this.isSettingsOpen;
    this.isHistoryViewOpen = false;

    const content = document.getElementById('settings-panel-content');
    const btn = document.querySelector('.settings-toggle-btn');

    // Hide all main tabs
    document.querySelectorAll('.panel-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.panel-tab').forEach(el => el.classList.remove('active'));

    if (this.isSettingsOpen) {
      content.style.display = 'block';
      btn.classList.add('active');
      btn.textContent = '✖ Close Settings';
    } else {
      content.style.display = 'none';
      btn.classList.remove('active');
      btn.textContent = '⚙️ Settings & Stats';

      // Revert to vehicles tab by default
      this.tracker.switchPanelTab('vehicles');
      this.updateVehiclePanel();
    }
  }

  // ✅ NEW: Show history inside the panel (nested view)
  showVehicleHistory(deviceId) {
    this.isHistoryViewOpen = true;
    this.isSettingsOpen = false;
    document.getElementById('settings-panel-content').style.display = 'none';

    // Switch to device in map view
    const deviceInfo = this.tracker.devices.get(deviceId);
    if (deviceInfo && !deviceInfo.visible) {
      this.tracker.deviceManager.toggleDeviceVisibility(deviceId, true);
    }

    const container = document.getElementById('vehicle-list-panel');
    if (!container) return;

    // Filter locations for this device
    const locations = this.tracker.locations.filter(loc => loc.device_id === deviceId);

    const listHtml = locations.length > 0 ? locations.slice(0, 50).map((loc, index) => `
      <div class="location-item" onclick="window.locationTracker.mapManager.centerMapOnLocation({latitude: ${loc.latitude}, longitude: ${loc.longitude}})">
        <div class="coordinates">${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}</div>
        <div class="timestamp">${new Date(loc.timestamp).toLocaleString()}</div>
      </div>
    `).join('') : `<div style="padding:20px; text-align:center; color:#9ca3af;">No history found</div>`;

    // Render Nested View
    container.innerHTML = `
      <div class="nested-history-header">
        <button class="back-btn" onclick="window.locationTracker.vehiclePanelManager.backToVehicleList()">
          ← Back
        </button>
        <div class="history-title">${deviceId} History</div>
      </div>
      <div id="location-list" style="display:flex; flex-direction:column; gap:10px;">
        ${listHtml}
      </div>
    `;
  }

  backToVehicleList() {
    this.isHistoryViewOpen = false;
    this.updateVehiclePanel();
  }

  updateVehiclePanel() {
    if (this.isHistoryViewOpen) return; // Don't overwrite if looking at history

    const container = document.getElementById('vehicle-list-panel');
    if (!container) return;

    if (this.tracker.devices.size === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
          <div style="font-size: 48px; margin-bottom: 16px;">🚗</div>
          <p style="margin: 0; font-size: 14px;">${this.tracker.t('noDevicesFound')}</p>
        </div>
      `;
      return;
    }

    // ... (Keep existing sorting logic) ...
    const vehiclesByStatus = new Map();
    this.tracker.devices.forEach((info, deviceId) => {
      const latestLocation = this.getLatestLocationForDevice(deviceId);
      const isOnline = latestLocation && this.isVehicleOnline(latestLocation.timestamp);
      vehiclesByStatus.set(deviceId, { info, location: latestLocation, online: isOnline });
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
              <div><strong>Coordinates:</strong></div>
              <div class="vehicle-item-coords">
                ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
              </div>
              <div style="margin-top: 8px;">
                <strong>Last Update:</strong><br>
                ${this.formatTimestamp(location.timestamp)}
              </div>
            </div>

            <div class="vehicle-item-actions">
              <button class="vehicle-action-btn" onclick="event.stopPropagation(); window.locationTracker.vehiclePanelManager.centerOnVehicle('${deviceId}')">
                🎯 Center
              </button>
              <!-- ✅ UPDATED: Now calls showVehicleHistory which renders nested view -->
              <button class="vehicle-action-btn secondary" onclick="event.stopPropagation(); window.locationTracker.vehiclePanelManager.showVehicleHistory('${deviceId}')">
                📜 History
              </button>
            </div>
          ` : `
            <div class="vehicle-item-details" style="color: #9ca3af; font-style: italic;">
              No data available
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  // ... (Keep existing helper methods like getLatestLocationForDevice, isVehicleOnline, formatTimestamp, centerOnVehicle, selectVehicle) ...
  getLatestLocationForDevice(deviceId) {
    const locations = this.tracker.isHistoryMode ? this.tracker.filteredLocations : this.tracker.locations;
    return locations.find(loc => loc.device_id === deviceId);
  }

  isVehicleOnline(timestamp) {
    const now = new Date();
    const lastUpdate = new Date(timestamp);
    const diffMinutes = (now - lastUpdate) / 1000 / 60;
    return diffMinutes < 5;
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
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
      const marker = this.tracker.mapManager.markers.get(deviceId);
      if (marker) {
        marker.togglePopup();
      }
    }
  }
}
