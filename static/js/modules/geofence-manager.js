export class GeofenceManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.mapManager = locationTracker.mapManager;
    this.map = this.mapManager.map;
    this.geofences = new Map();
    this.drawingMode = false;
    this.drawingPoints = [];
    this.drawingMarkers = [];
    this.tempLineSourceId = 'temp-drawing-line';
    this.geofenceViolations = new Map(); // Track violations per device
    this.showGeofences = true;
    this.devicesInsideGeofences = new Map(); // Track which devices are in which geofences
    this.totalAlerts = 0;
  }

  initialize() {
    // Add temporary drawing line source
    this.map.addSource(this.tempLineSourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });

    this.map.addLayer({
      id: 'temp-drawing-line',
      type: 'line',
      source: this.tempLineSourceId,
      paint: {
        'line-color': '#667eea',
        'line-width': 2,
        'line-dasharray': [2, 2]
      }
    });

    // Load existing geofences
    this.loadGeofences();

    // Listen for location updates to check violations
    this.setupViolationDetection();

    // Update stats periodically
    setInterval(() => this.updateGeofenceStats(), 5000);
  }

  async loadGeofences() {
    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences`);
      if (response.ok) {
        const geofences = await response.json();
        this.geofences.clear();
        
        // Clear existing geofence layers
        this.clearAllGeofenceLayers();
        
        geofences.forEach(gf => {
          this.geofences.set(gf.id, gf);
          this.drawGeofence(gf);
        });
        
        console.log(`Loaded ${geofences.length} geofences`);
        this.updateGeofenceList();
        this.updateGeofenceStats();
        
        // Check all current device locations against geofences
        this.checkAllDeviceLocations();
      }
    } catch (error) {
      console.error('Error loading geofences:', error);
    }
  }

  clearAllGeofenceLayers() {
    this.geofences.forEach((gf, id) => {
      const sourceId = `geofence-${id}`;
      if (this.map.getLayer(`${sourceId}-fill`)) {
        this.map.removeLayer(`${sourceId}-fill`);
      }
      if (this.map.getLayer(`${sourceId}-outline`)) {
        this.map.removeLayer(`${sourceId}-outline`);
      }
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    });
  }

  drawGeofence(geofence) {
    if (!geofence.coordinates || geofence.coordinates.length < 3) return;

    const sourceId = `geofence-${geofence.id}`;
    
    // Remove existing layers if present
    if (this.map.getLayer(`${sourceId}-fill`)) {
      this.map.removeLayer(`${sourceId}-fill`);
    }
    if (this.map.getLayer(`${sourceId}-outline`)) {
      this.map.removeLayer(`${sourceId}-outline`);
    }
    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId);
    }

    // Add source
    this.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {
          id: geofence.id,
          name: geofence.name
        },
        geometry: {
          type: 'Polygon',
          coordinates: [geofence.coordinates]
        }
      }
    });

    // Add fill layer
    this.map.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': geofence.active ? '#667eea' : '#9ca3af',
        'fill-opacity': 0.2
      }
    });

    // Add outline layer
    this.map.addLayer({
      id: `${sourceId}-outline`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': geofence.active ? '#667eea' : '#9ca3af',
        'line-width': 2
      }
    });

    // Add click handler for geofence info
    this.map.on('click', `${sourceId}-fill`, (e) => {
      this.showGeofencePopup(geofence, e.lngLat);
    });

    // Change cursor on hover
    this.map.on('mouseenter', `${sourceId}-fill`, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', `${sourceId}-fill`, () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  showGeofencePopup(geofence, lngLat) {
    const devicesInside = this.getDevicesInGeofence(geofence.id);
    const devicesList = devicesInside.length > 0 
      ? devicesInside.map(d => `<li>${d}</li>`).join('') 
      : `<li style="color: #9ca3af;">${this.tracker.t('noDevicesFound')}</li>`;

    const areaKm2 = this.calculateGeofenceArea(geofence.coordinates);

    new maplibregl.Popup()
      .setLngLat(lngLat)
      .setHTML(`
        <div style="font-family: system-ui; min-width: 250px;">
          <h4 style="margin: 0 0 10px 0; color: #667eea;">
            📍 ${geofence.name}
          </h4>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
            ${geofence.description || this.tracker.t('noDescription') || 'No description'}
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
            ${this.tracker.t('geofenceArea')}: ${areaKm2.toFixed(2)} ${this.tracker.t('geofenceAreaKm')}
          </div>
          <div style="font-size: 11px; margin-bottom: 8px;">
            <strong>${this.tracker.t('geofenceStatus')}:</strong> 
            <span style="color: ${geofence.active ? '#10b981' : '#ef4444'};">
              ${geofence.active ? '✓ ' + this.tracker.t('activeGeofences') : '✗ ' + this.tracker.t('inactive')}
            </span>
          </div>
          <div style="font-size: 11px; margin-bottom: 10px;">
            <strong>${this.tracker.t('devicesInside')} (${devicesInside.length}):</strong>
            <ul style="margin: 5px 0; padding-left: 20px; max-height: 100px; overflow-y: auto;">
              ${devicesList}
            </ul>
          </div>
          <div style="display: flex; gap: 5px; flex-wrap: wrap;">
            <button 
              onclick="window.locationTracker.geofenceManager.toggleGeofenceActive(${geofence.id})" 
              style="flex: 1; padding: 6px 10px; background: ${geofence.active ? '#f59e0b' : '#10b981'}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
              ${geofence.active ? this.tracker.t('deactivateGeofence') : this.tracker.t('activateGeofence')}
            </button>
            <button 
              onclick="window.locationTracker.geofenceManager.deleteGeofence(${geofence.id})" 
              style="flex: 1; padding: 6px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
              🗑️ ${this.tracker.t('deleteGeofence')}
            </button>
          </div>
        </div>
      `)
      .addTo(this.map);
  }

  calculateGeofenceArea(coordinates) {
    // Simple area calculation using Shoelace formula
    // Convert to approximate km² (very rough estimate)
    let area = 0;
    const n = coordinates.length - 1; // Exclude closing point
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += coordinates[i][0] * coordinates[j][1];
      area -= coordinates[j][0] * coordinates[i][1];
    }
    
    area = Math.abs(area) / 2;
    // Convert from degrees² to approximate km² (very rough at equator)
    const kmPerDegree = 111.32;
    return area * kmPerDegree * kmPerDegree;
  }

  getDevicesInGeofence(geofenceId) {
    const devices = [];
    this.devicesInsideGeofences.forEach((geofences, deviceId) => {
      if (geofences.has(geofenceId)) {
        devices.push(deviceId);
      }
    });
    return devices;
  }

  async toggleGeofenceActive(geofenceId) {
    const geofence = this.geofences.get(geofenceId);
    if (!geofence) return;

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences/${geofenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !geofence.active })
      });

      if (response.ok) {
        const updated = await response.json();
        this.geofences.set(geofenceId, updated);
        this.drawGeofence(updated);
        this.updateGeofenceList();
        this.showNotification(
          `${this.tracker.t('geofence')} "${geofence.name}" ${updated.active ? this.tracker.t('activated') : this.tracker.t('deactivated')}`,
          'success'
        );
      }
    } catch (error) {
      console.error('Error toggling geofence:', error);
    }
  }

  startDrawing() {
    if (this.drawingMode) {
      this.cancelDrawing();
      return;
    }

    this.drawingMode = true;
    this.drawingPoints = [];
    this.clearDrawingMarkers();
    
    this.map.getCanvas().style.cursor = 'crosshair';
    
    this.showNotification(
      this.tracker.t('drawingModeActive') + ' ' + this.tracker.t('doubleClickToFinish'),
      'info'
    );
  }

  cancelDrawing() {
    this.drawingMode = false;
    this.drawingPoints = [];
    this.clearDrawingMarkers();
    this.updateTempLine();
    this.map.getCanvas().style.cursor = '';
    
    this.showNotification(this.tracker.t('drawingCancelled'), 'info');
  }

  handleMapClick(e) {
    if (!this.drawingMode) return;

    const point = [e.lngLat.lng, e.lngLat.lat];
    this.drawingPoints.push(point);
    
    const marker = new maplibregl.Marker({ color: '#667eea' })
      .setLngLat(point)
      .addTo(this.map);
    this.drawingMarkers.push(marker);
    
    this.updateTempLine();
    
    if (this.drawingPoints.length >= 3) {
      this.showNotification(
        `${this.drawingPoints.length} ${this.tracker.t('pointsAdded')}. ${this.tracker.t('doubleClickToFinish')}`,
        'info',
        2000
      );
    } else {
      this.showNotification(
        `${this.drawingPoints.length} ${this.tracker.t('pointsAdded')}. ${this.tracker.t('minimumPoints')}`,
        'info',
        2000
      );
    }
  }

  handleMapDoubleClick(e) {
    if (!this.drawingMode || this.drawingPoints.length < 3) return;
    
    e.preventDefault();
    this.finishDrawing();
  }

  updateTempLine() {
    if (this.drawingPoints.length < 2) {
      this.map.getSource(this.tempLineSourceId).setData({
        type: 'FeatureCollection',
        features: []
      });
      return;
    }

    const lineCoords = [...this.drawingPoints];
    if (this.drawingPoints.length >= 3) {
      lineCoords.push(this.drawingPoints[0]);
    }

    this.map.getSource(this.tempLineSourceId).setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineCoords
        }
      }]
    });
  }

  async finishDrawing() {
    if (this.drawingPoints.length < 3) {
      this.showNotification(this.tracker.t('minimumPoints'), 'error');
      return;
    }

    const name = prompt(this.tracker.t('enterGeofenceName'), `${this.tracker.t('geofence')} ${Date.now()}`);
    if (!name) {
      this.cancelDrawing();
      return;
    }

    const description = prompt(this.tracker.t('enterDescription'), '');

    const coordinates = [...this.drawingPoints, this.drawingPoints[0]];

    const geofenceData = {
      name: name,
      description: description || `${this.tracker.t('created')} ${new Date().toLocaleString()}`,
      coordinates: coordinates
    };

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geofenceData)
      });

      if (response.ok) {
        const newGeofence = await response.json();
        this.geofences.set(newGeofence.id, newGeofence);
        this.drawGeofence(newGeofence);
        this.showNotification(`✓ ${this.tracker.t('geofenceCreated')}: "${name}"`, 'success');
        this.cancelDrawing();
        this.updateGeofenceList();
        this.updateGeofenceStats();
      } else {
        const errorText = await response.text();
        this.showNotification(`✗ ${this.tracker.t('error')}: ${errorText}`, 'error');
      }
    } catch (error) {
      this.showNotification(`✗ ${this.tracker.t('error')}: ${error.message}`, 'error');
    }
  }

  async deleteGeofence(geofenceId) {
    const geofence = this.geofences.get(geofenceId);
    if (!geofence) return;

    if (!confirm(this.tracker.t('confirmDelete'))) {
      return;
    }

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences/${geofenceId}`, {
        method: 'DELETE'
      });

      if (response.ok || response.status === 204) {
        const sourceId = `geofence-${geofenceId}`;
        if (this.map.getLayer(`${sourceId}-fill`)) {
          this.map.removeLayer(`${sourceId}-fill`);
        }
        if (this.map.getLayer(`${sourceId}-outline`)) {
          this.map.removeLayer(`${sourceId}-outline`);
        }
        if (this.map.getSource(sourceId)) {
          this.map.removeSource(sourceId);
        }
        
        this.geofences.delete(geofenceId);
        this.showNotification(`✓ ${this.tracker.t('geofenceDeleted')}: "${geofence.name}"`, 'success');
        this.updateGeofenceList();
        this.updateGeofenceStats();
      } else {
        this.showNotification(`✗ ${this.tracker.t('error')}`, 'error');
      }
    } catch (error) {
      this.showNotification(`✗ ${this.tracker.t('error')}: ${error.message}`, 'error');
    }
  }

  clearDrawingMarkers() {
    this.drawingMarkers.forEach(m => m.remove());
    this.drawingMarkers = [];
  }

  setupViolationDetection() {
    const originalHandleUpdate = this.tracker.handleLocationUpdate.bind(this.tracker);
    this.tracker.handleLocationUpdate = (location) => {
      originalHandleUpdate(location);
      this.checkGeofenceViolation(location);
    };
  }

  async checkGeofenceViolation(location) {
    try {
      const response = await fetch(
        `${this.tracker.config.apiBaseUrl}/api/geofence/check?lat=${location.latitude}&lng=${location.longitude}`
      );
      
      if (response.ok) {
        const result = await response.json();
        const currentGeofences = new Set(result.geofences.map(gf => gf.id));
        
        // Get previous state
        const previousGeofences = this.devicesInsideGeofences.get(location.device_id) || new Set();
        
        // Check for entries
        currentGeofences.forEach(gfId => {
          if (!previousGeofences.has(gfId)) {
            const geofence = this.geofences.get(gfId);
            if (geofence) {
              this.handleViolationEvent(location, 'entered', [geofence]);
              this.totalAlerts++;
            }
          }
        });
        
        // Check for exits
        previousGeofences.forEach(gfId => {
          if (!currentGeofences.has(gfId)) {
            const geofence = this.geofences.get(gfId);
            if (geofence) {
              this.handleViolationEvent(location, 'exited', [geofence]);
              this.totalAlerts++;
            }
          }
        });
        
        // Update state
        this.devicesInsideGeofences.set(location.device_id, currentGeofences);
        this.updateGeofenceStats();
      }
    } catch (error) {
      console.error('Error checking geofence violation:', error);
    }
  }

  checkAllDeviceLocations() {
    // Check all current device locations against geofences
    this.tracker.locations.forEach(location => {
      this.checkGeofenceViolation(location);
    });
  }

  handleViolationEvent(location, eventType, geofences) {
    const deviceInfo = this.tracker.devices.get(location.device_id);
    const geofenceNames = geofences.map(gf => gf.name).join(', ');
    
    const message = eventType === 'entered' 
      ? `🚨 ${location.device_id} ${this.tracker.t('deviceEntered')}: ${geofenceNames}`
      : `🚨 ${location.device_id} ${this.tracker.t('deviceExited')}: ${geofenceNames}`;
    
    this.showNotification(message, eventType === 'entered' ? 'warning' : 'info', 5000);
    
    const marker = this.tracker.mapManager.markers.get(location.device_id);
    if (marker) {
      const el = marker.getElement();
      if (eventType === 'entered') {
        el.style.border = '3px solid #ef4444';
        el.style.animation = 'pulse 1s infinite';
      } else {
        el.style.border = '2px solid white';
        el.style.animation = 'none';
      }
    }
    
    console.log(`Geofence ${eventType}:`, {
      device: location.device_id,
      geofences: geofenceNames,
      location: { lat: location.latitude, lng: location.longitude }
    });
  }

  toggleGeofenceVisibility() {
    this.showGeofences = !this.showGeofences;
    const visibility = this.showGeofences ? 'visible' : 'none';
    
    this.geofences.forEach((gf, id) => {
      const sourceId = `geofence-${id}`;
      if (this.map.getLayer(`${sourceId}-fill`)) {
        this.map.setLayoutProperty(`${sourceId}-fill`, 'visibility', visibility);
      }
      if (this.map.getLayer(`${sourceId}-outline`)) {
        this.map.setLayoutProperty(`${sourceId}-outline`, 'visibility', visibility);
      }
    });
    
    this.showNotification(
      this.showGeofences ? this.tracker.t('geofencesVisible') : this.tracker.t('geofencesHidden'),
      'info'
    );
  }

  updateGeofenceList() {
    const container = document.getElementById('geofence-items');
    if (!container) return;

    if (this.geofences.size === 0) {
      container.innerHTML = `
        <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 20px;">
          <span>${this.tracker.t('noGeofencesCreated')}</span>
        </div>
      `;
      return;
    }

    const items = Array.from(this.geofences.values()).map(gf => {
      const devicesInside = this.getDevicesInGeofence(gf.id);
      const areaKm2 = this.calculateGeofenceArea(gf.coordinates);
      
      return `
        <div class="geofence-list-item" style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 10px; background: #f9fafb; cursor: pointer; transition: all 0.2s;" 
             onclick="window.locationTracker.geofenceManager.focusGeofence(${gf.id})">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div style="flex: 1;">
              <h5 style="margin: 0 0 4px 0; color: #374151; font-size: 14px; font-weight: 600;">
                ${gf.name}
              </h5>
              <p style="margin: 0; color: #6b7280; font-size: 11px;">
                ${gf.description || this.tracker.t('noDescription') || 'No description'}
              </p>
            </div>
            <span class="badge ${gf.active ? 'active' : 'inactive'}" style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap;">
              ${gf.active ? '✓ ' + this.tracker.t('active') : '✗ ' + this.tracker.t('inactive')}
            </span>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px; color: #6b7280;">
            <div>
              <strong>${this.tracker.t('geofenceArea')}:</strong> ${areaKm2.toFixed(2)} ${this.tracker.t('geofenceAreaKm')}
            </div>
            <div>
              <strong>${this.tracker.t('devicesInside')}:</strong> 
              <span style="color: ${devicesInside.length > 0 ? '#10b981' : '#9ca3af'}; font-weight: 600;">
                ${devicesInside.length}
              </span>
            </div>
          </div>
          
          ${devicesInside.length > 0 ? `
            <div style="margin-top: 8px; font-size: 11px;">
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${devicesInside.map(deviceId => {
                  const deviceInfo = this.tracker.devices.get(deviceId);
                  const color = deviceInfo ? deviceInfo.color : '#6b7280';
                  return `
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
                      <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></div>
                      <span style="font-size: 10px; color: #374151;">${deviceId}</span>
                    </span>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
          
          <div style="margin-top: 8px; font-size: 10px; color: #9ca3af;">
            ${this.tracker.t('created')}: ${new Date(gf.created_at).toLocaleDateString()}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = items;
  }

  focusGeofence(geofenceId) {
    const geofence = this.geofences.get(geofenceId);
    if (!geofence || !geofence.coordinates) return;

    // Calculate bounds
    const bounds = new maplibregl.LngLatBounds();
    geofence.coordinates.forEach(coord => {
      bounds.extend(coord);
    });

    // Fit map to geofence
    this.map.fitBounds(bounds, {
      padding: 100,
      duration: 1000
    });

    // Show popup at center
    setTimeout(() => {
      const center = bounds.getCenter();
      this.showGeofencePopup(geofence, center);
    }, 1000);
  }

  updateGeofenceStats() {
    // Update total geofences
    const totalElement = document.getElementById('total-geofences-count');
    if (totalElement) {
      totalElement.textContent = this.geofences.size;
    }

    // Update active geofences
    const activeCount = Array.from(this.geofences.values()).filter(gf => gf.active).length;
    const activeElement = document.getElementById('active-geofences-count');
    if (activeElement) {
      activeElement.textContent = activeCount;
    }

    // Update devices inside
    const devicesInsideCount = this.devicesInsideGeofences.size;
    const devicesElement = document.getElementById('devices-inside-count');
    if (devicesElement) {
      devicesElement.textContent = devicesInsideCount;
    }

    // Update total alerts
    const alertsElement = document.getElementById('total-violations-count');
    if (alertsElement) {
      alertsElement.textContent = this.totalAlerts;
    }
  }

  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `geofence-notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      max-width: 400px;
      animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }
}
