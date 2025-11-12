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
  }

  async loadGeofences() {
    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences`);
      if (response.ok) {
        const geofences = await response.json();
        geofences.forEach(gf => {
          this.geofences.set(gf.id, gf);
          this.drawGeofence(gf);
        });
        console.log(`Loaded ${geofences.length} geofences`);
      }
    } catch (error) {
      console.error('Error loading geofences:', error);
    }
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
      const coordinates = e.lngLat;
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(`
          <div style="font-family: system-ui; min-width: 200px;">
            <h4 style="margin: 0 0 10px 0; color: #667eea;">
              📍 ${geofence.name}
            </h4>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
              ${geofence.description || 'No description'}
            </div>
            <div style="font-size: 11px; color: #9ca3af;">
              ID: ${geofence.id} | ${geofence.active ? '✓ Active' : '✗ Inactive'}
            </div>
            <button 
              onclick="window.locationTracker.geofenceManager.deleteGeofence(${geofence.id})" 
              style="margin-top: 10px; padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;">
              🗑️ Delete Geofence
            </button>
          </div>
        `)
        .addTo(this.map);
    });

    // Change cursor on hover
    this.map.on('mouseenter', `${sourceId}-fill`, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', `${sourceId}-fill`, () => {
      this.map.getCanvas().style.cursor = '';
    });
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
    
    // Show notification
    this.showNotification('🖊️ Drawing mode active. Click to add points. Double-click or press Enter to finish.', 'info');
    
    // Update button state
    const btn = document.getElementById('draw-geofence-btn');
    if (btn) {
      btn.textContent = '✖ Cancel Drawing';
      btn.classList.add('danger');
    }
  }

  cancelDrawing() {
    this.drawingMode = false;
    this.drawingPoints = [];
    this.clearDrawingMarkers();
    this.updateTempLine();
    this.map.getCanvas().style.cursor = '';
    
    const btn = document.getElementById('draw-geofence-btn');
    if (btn) {
      btn.textContent = '🖊️ Draw Geofence';
      btn.classList.remove('danger');
    }
    
    this.showNotification('Drawing cancelled', 'info');
  }

  handleMapClick(e) {
    if (!this.drawingMode) return;

    const point = [e.lngLat.lng, e.lngLat.lat];
    this.drawingPoints.push(point);
    
    // Add marker
    const marker = new maplibregl.Marker({ color: '#667eea' })
      .setLngLat(point)
      .addTo(this.map);
    this.drawingMarkers.push(marker);
    
    // Update temporary line
    this.updateTempLine();
    
    if (this.drawingPoints.length >= 3) {
      this.showNotification(`${this.drawingPoints.length} points added. Double-click or press Enter to finish.`, 'info');
    } else {
      this.showNotification(`${this.drawingPoints.length} points added. Need at least 3 points.`, 'info');
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
      lineCoords.push(this.drawingPoints[0]); // Close the polygon
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
      this.showNotification('Need at least 3 points to create a geofence', 'error');
      return;
    }

    const name = prompt('Enter geofence name:', `Geofence ${Date.now()}`);
    if (!name) {
      this.cancelDrawing();
      return;
    }

    const description = prompt('Enter description (optional):', '');

    // Close the polygon
    const coordinates = [...this.drawingPoints, this.drawingPoints[0]];

    const geofenceData = {
      name: name,
      description: description || 'Created from map',
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
        this.showNotification(`✓ Geofence "${name}" created successfully`, 'success');
        this.cancelDrawing();
      } else {
        const errorText = await response.text();
        this.showNotification(`✗ Failed to create geofence: ${errorText}`, 'error');
      }
    } catch (error) {
      this.showNotification(`✗ Error: ${error.message}`, 'error');
    }
  }

  async deleteGeofence(geofenceId) {
    if (!confirm('Are you sure you want to delete this geofence?')) {
      return;
    }

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences/${geofenceId}`, {
        method: 'DELETE'
      });

      if (response.ok || response.status === 204) {
        // Remove from map
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
        this.showNotification('✓ Geofence deleted', 'success');
      } else {
        this.showNotification('✗ Failed to delete geofence', 'error');
      }
    } catch (error) {
      this.showNotification(`✗ Error: ${error.message}`, 'error');
    }
  }

  clearDrawingMarkers() {
    this.drawingMarkers.forEach(m => m.remove());
    this.drawingMarkers = [];
  }

  setupViolationDetection() {
    // Check violations when new location arrives
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
        const wasInside = this.geofenceViolations.get(location.device_id) || false;
        const isInside = result.count > 0;
        
        // Detect state change
        if (wasInside !== isInside) {
          const eventType = isInside ? 'entered' : 'exited';
          this.handleViolationEvent(location, eventType, result.geofences);
        }
        
        this.geofenceViolations.set(location.device_id, isInside);
      }
    } catch (error) {
      console.error('Error checking geofence violation:', error);
    }
  }

  handleViolationEvent(location, eventType, geofences) {
    const deviceInfo = this.tracker.devices.get(location.device_id);
    const geofenceNames = geofences ? geofences.map(gf => gf.name).join(', ') : 'unknown';
    
    const message = eventType === 'entered' 
      ? `🚨 Device ${location.device_id} ENTERED geofence: ${geofenceNames}`
      : `🚨 Device ${location.device_id} EXITED geofence: ${geofenceNames}`;
    
    // Show notification
    this.showNotification(message, eventType === 'entered' ? 'warning' : 'info', 5000);
    
    // Update marker appearance
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
    
    // Log to console
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
    
    const btn = document.getElementById('toggle-geofences-btn');
    if (btn) {
      btn.textContent = this.showGeofences ? '👁️ Hide Geofences' : '👁️‍🗨️ Show Geofences';
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

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
