export class DeviceManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.devices = new Map();
    this.selectedDevices = new Set();
  }

  getDeviceColor(deviceId) {
    if (!this.devices.has(deviceId)) {
      const colorIndex = this.devices.size % this.tracker.deviceColors.length;
      this.devices.set(deviceId, {
        color: this.tracker.deviceColors[colorIndex],
        visible: true,
        count: 0
      });
    }
    return this.devices.get(deviceId).color;
  }

  async loadDevices() {
    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/devices`);
      if (response.ok) {
        const deviceList = await response.json();

        deviceList.forEach(device => {
          if (!this.devices.has(device.device_id)) {
            const colorIndex = this.devices.size % this.tracker.deviceColors.length;
            this.devices.set(device.device_id, {
              color: this.tracker.deviceColors[colorIndex],
              visible: true,
              count: device.location_count,
              lastSeen: device.last_seen
            });
          }
          this.selectedDevices.add(device.device_id);
        });

        this.updateDeviceLegend();
        this.updateDeviceFilterList();
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }

  updateDeviceLegend() {
    const container = document.getElementById('legend-items');
    const countElement = document.getElementById('device-count');

    countElement.textContent = this.devices.size;

    if (this.devices.size === 0) {
      container.innerHTML = `<div style="color: #9ca3af; font-size: 12px;">${this.tracker.t('noDevicesFound')}</div>`;
      return;
    }

    container.innerHTML = '';

    this.devices.forEach((info, deviceId) => {
      const item = document.createElement('div');
      item.className = `legend-item ${!info.visible ? 'disabled' : ''}`;

      item.innerHTML = `
        <input type="checkbox" class="legend-checkbox" ${info.visible ? 'checked' : ''} 
              data-device="${deviceId}">
        <div class="legend-color" style="background-color: ${info.color}"></div>
        <div class="legend-info">
          <div class="legend-device-name">${deviceId}</div>
          <div class="legend-stats">${this.tracker.t('locationsCount').replace('{0}', info.count)}</div>
        </div>
      `;

      const checkbox = item.querySelector('.legend-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleDeviceVisibility(deviceId, checkbox.checked);
      });

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.toggleDeviceVisibility(deviceId, checkbox.checked);
        }
      });

      container.appendChild(item);
    });
  }

  updateDeviceFilterList() {
    const container = document.getElementById('device-filter-list');

    if (this.devices.size === 0) {
      container.innerHTML = `<div style="color: #9ca3af; padding: 10px;">${this.tracker.t('noDevicesFound')}</div>`;
      return;
    }

    container.innerHTML = '';

    this.devices.forEach((info, deviceId) => {
      const item = document.createElement('div');
      item.className = 'device-filter-item';

      item.innerHTML = `
        <input type="checkbox" class="device-filter-checkbox" ${info.visible ? 'checked' : ''} 
              data-device="${deviceId}">
        <div class="device-filter-color" style="background-color: ${info.color}"></div>
        <span style="font-size: 13px; color: #374151;">${deviceId}</span>
      `;

      const checkbox = item.querySelector('.device-filter-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleDeviceVisibility(deviceId, checkbox.checked);
      });

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.toggleDeviceVisibility(deviceId, checkbox.checked);
        }
      });

      container.appendChild(item);
    });
  }

  toggleDeviceVisibility(deviceId, visible) {
    const deviceInfo = this.devices.get(deviceId);
    if (deviceInfo) {
      deviceInfo.visible = visible;

      if (visible) {
        this.selectedDevices.add(deviceId);
      } else {
        this.selectedDevices.delete(deviceId);
        
        // 🆕 CLEAR TRACE MARKERS for this device
        this.clearDeviceTraceMarkers(deviceId);
        
        // 🆕 CLEAR ROUTE LINE for this device
        this.clearDeviceRoute(deviceId);
      }

      // Hide/show the main marker for this device
      const marker = this.tracker.mapManager.markers.get(deviceId);
      if (marker) {
        const el = marker.getElement();
        el.style.display = visible ? 'block' : 'none';
      }

      this.updateDeviceLegend();
      this.updateDeviceFilterList();

      // 🆕 REGENERATE all visible devices' visualizations
      if (this.tracker.isHistoryMode) {
        if (visible) {
          // When re-selecting in history mode, force a full reload to recreate visualizations
          if (this.tracker.historyManager.activeFilterType === 'time' && this.tracker.historyManager.timeFilter) {
            this.tracker.historyManager.loadHistoricalData();
          } else if (this.tracker.historyManager.activeFilterType === 'location' && this.tracker.historyManager.locationFilter) {
            this.tracker.historyManager.loadHistoricalByLocation(
              this.tracker.historyManager.locationFilter.lat,
              this.tracker.historyManager.locationFilter.lng,
              this.tracker.historyManager.locationFilter.radius
            );
          } else {
            // Force recreation of filtered view
            this.tracker.mapManager.clearTraceMarkers();
            this.tracker.updateRouteForFiltered();
          }
        }
        // When deselecting, no need to reload - we already cleared above
      } else {
        // In live mode, regenerate traces and routes for all selected devices
        if (visible) {
          // Force recreation of all traces
          this.tracker.mapManager.clearTraceMarkers();
          this.tracker.updateRouteForDevice();
        }
      }
    }
  }

  // 🆕 NEW METHOD: Clear trace markers for a specific device
  clearDeviceTraceMarkers(deviceId) {
    // Filter out and remove trace markers that belong to this device
    const locationsToCheck = this.tracker.isHistoryMode 
      ? this.tracker.filteredLocations 
      : this.tracker.locations;

    this.tracker.mapManager.traceMarkers = this.tracker.mapManager.traceMarkers.filter(marker => {
      const lngLat = marker.getLngLat();
      
      // Check if this marker belongs to the device being hidden
      const belongsToDevice = locationsToCheck.some(loc => 
        loc.device_id === deviceId && 
        Math.abs(loc.longitude - lngLat.lng) < 0.000001 && 
        Math.abs(loc.latitude - lngLat.lat) < 0.000001
      );
      
      if (belongsToDevice) {
        marker.remove(); // Remove from map
        return false; // Remove from array
      }
      
      return true; // Keep in array
    });
  }

  // 🆕 NEW METHOD: Clear route line for a specific device
  clearDeviceRoute(deviceId) {
    const sourceId = `route-${deviceId}`;
    const layerId = `route-${deviceId}`;

    if (this.tracker.mapManager.map.getLayer(layerId)) {
      this.tracker.mapManager.map.removeLayer(layerId);
    }
    if (this.tracker.mapManager.map.getSource(sourceId)) {
      this.tracker.mapManager.map.removeSource(sourceId);
    }
  }

  updateRoutesVisibility() {
    this.devices.forEach((info, deviceId) => {
      const layerId = `route-${deviceId}`;
      if (this.tracker.mapManager.map.getLayer(layerId)) {
        this.tracker.mapManager.map.setLayoutProperty(
          layerId,
          'visibility',
          info.visible ? 'visible' : 'none'
        );
      }
    });
  }

  updateDeviceRoute(deviceId) {
    const deviceLocations = this.tracker.locations
      .filter(loc => loc.device_id === deviceId)
      .slice(0, 50);

    if (deviceLocations.length < 2) return;

    const coordinates = deviceLocations.map(loc => [loc.longitude, loc.latitude]);
    const deviceInfo = this.devices.get(deviceId);

    const sourceId = `route-${deviceId}`;
    const layerId = `route-${deviceId}`;

    if (this.tracker.mapManager.map.getSource(sourceId)) {
      this.tracker.mapManager.map.getSource(sourceId).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    } else {
      this.tracker.mapManager.map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      });

      this.tracker.mapManager.map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': deviceInfo.color,
          'line-width': 4,
          'line-opacity': 0.8
        }
      });
    }

    if (this.tracker.mapManager.map.getLayer(layerId)) {
      this.tracker.mapManager.map.setLayoutProperty(
        layerId,
        'visibility',
        deviceInfo.visible ? 'visible' : 'none'
      );
    }

    deviceLocations.forEach((loc, index) => {
      const progress = 1 - (index / (deviceLocations.length - 1));
      const isStart = index === deviceLocations.length - 1;
      const isEnd = index === 0;

      if (!this.tracker.isHistoryMode && isEnd) {
        return;
      }

      this.tracker.mapManager.createTraceMarker(loc, isStart, isEnd, progress);
    });
  }
}
