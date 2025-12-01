export class RouteManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.mapManager = locationTracker.mapManager;
    this.map = this.mapManager.map;
    this.routes = new Map();
    this.showRoutes = true;
    this.routeLegendCollapsed = false;
    this.visibleRoutes = new Set();
    this.routeColors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
  }

  initialize() {
    // ADD: Track current popup
    this.currentPopup = null;

    // ADD: Close popup on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentPopup) {
        this.currentPopup.remove();
        this.currentPopup = null;
      }
    });

    // ADD: Close popup when clicking map background
    this.map.on('click', (e) => {
      const features = this.map.queryRenderedFeatures(e.point);
      const isRouteClick = features.some(f => f.source && f.source.startsWith('route-'));

      if (!isRouteClick && this.currentPopup) {
        this.currentPopup.remove();
        this.currentPopup = null;
      }
    });

    this.loadRoutes();
  }

  async loadRoutes() {
    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/routes?limit=50`);
      if (response.ok) {
        const routes = await response.json();
        this.routes.clear();

        // Clear existing route layers
        this.clearAllRouteLayers();

        routes.forEach(route => {
          this.routes.set(route.id, route);
          this.visibleRoutes.add(route.id);
          this.drawRoute(route);
        });

        console.log(`Loaded ${routes.length} routes`);
        this.updateRouteList();
        this.updateRouteStats();
      }
    } catch (error) {
      console.error('Error loading routes:', error);
    }
    this.updateRouteLegend();
  }

  clearAllRouteLayers() {
    this.routes.forEach((route, id) => {
      const sourceId = `route-${id}`;
      if (this.map.getLayer(sourceId)) {
        this.map.removeLayer(sourceId);
      }
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    });
  }

  drawRoute(route) {
    if (!route.coordinates || route.coordinates.length < 2) return;

    const sourceId = `route-${route.id}`;
    const color = this.routeColors[route.id % this.routeColors.length];

    // Remove existing layer if present
    if (this.map.getLayer(sourceId)) {
      this.map.removeLayer(sourceId);
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
          id: route.id,
          name: route.route_name
        },
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates
        }
      }
    });

    const isVisible = this.visibleRoutes.has(route.id) && this.showRoutes;

    // Add route line
    this.map.addLayer({
      id: sourceId,
      type: 'line',
      source: sourceId,
      layout: {
        'visibility': isVisible ? 'visible' : 'none',
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': color,
        'line-width': 4,
        'line-opacity': 0.8
      }
    });

    // Add click handler
    this.map.on('click', sourceId, (e) => {
      this.showRoutePopup(route, e.lngLat, color);
    });

    // Change cursor on hover
    this.map.on('mouseenter', sourceId, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', sourceId, () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  showRoutePopup(route, lngLat, color) {
    // CLOSE any existing popup first
    if (this.currentPopup) {
      this.currentPopup.remove();
    }

    const distanceKm = (route.distance_meters / 1000).toFixed(2);
    const duration = this.calculateDuration(route.start_time, route.end_time);

    this.currentPopup = new maplibregl.Popup({
      maxWidth: '300px',
      closeButton: true,
      closeOnClick: false
    })
      .setLngLat(lngLat)
      .setHTML(`
        <div style="font-family: system-ui; min-width: 250px; max-width: 300px;">
          <h4 style="margin: 0 0 10px 0; color: ${color}; word-wrap: break-word;">
            🛣️ ${route.route_name || 'Unnamed Route'}
          </h4>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
            <strong>Device:</strong> ${route.device_id}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
            <strong>Distance:</strong> ${distanceKm} km
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
            <strong>Duration:</strong> ${duration}
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
            <strong>Start:</strong> ${new Date(route.start_time).toLocaleString()}<br>
            <strong>End:</strong> ${new Date(route.end_time).toLocaleString()}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
            <button
              onclick="window.locationTracker.routeManager.focusRoute(${route.id})"
              style="width: 100%; padding: 8px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
              🎯 Center on Route
            </button>
            <button
              onclick="window.locationTracker.routeManager.deleteRoute(${route.id})"
              style="width: 100%; padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
              🗑️ Delete Route
            </button>
          </div>
        </div>
      `)
      .addTo(this.map);

    // Track when popup is closed
    this.currentPopup.on('close', () => {
      this.currentPopup = null;
    });
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  }

  startCreatingRoute() {
    // Open history mode configuration to select time range and device
    if (this.tracker.uiManager) {
      this.tracker.uiManager.closeAllMenus();
    }
    const popup = document.createElement('div');
    popup.className = 'popup-menu active';
    popup. id = 'route-creation-popup';
    popup.style.zIndex = '10001';

    popup.innerHTML = `
      <div class="popup-content" style="max-width: 500px;">
        <div class="popup-header">
          <h2>➕ Create Route</h2>
          <button class="popup-close" onclick="document.getElementById('route-creation-popup').remove()">×</button>
        </div>
        <div class="popup-body" style="padding: 30px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <button class="btn" onclick="window. locationTracker.routeManager. showHistoryRouteForm()" style="padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <span style="font-size: 32px;">📅</span>
              <span>From History</span>
            </button>
            <button class="btn secondary" onclick="window.locationTracker.routeManager.startManualRouteDrawing()" style="padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <span style="font-size: 32px;">✏️</span>
              <span>Draw Manually</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popup);
  }

  showHistoryRouteForm() {
    const popup = document.getElementById('route-creation-popup');
    if (!popup) return;

    popup.querySelector('.popup-body').innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="control-group">
            <label for="route-device-select">Select Device:</label>
            <select id="route-device-select" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
              <option value="">Select a device...</option>
            </select>
          </div>

          <div class="control-group">
            <label for="route-name-input">Route Name:</label>
            <input type="text" id="route-name-input" placeholder="My Route" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
          </div>

          <div class="control-group">
            <label for="route-start-time">Start Time:</label>
            <input type="datetime-local" id="route-start-time" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
          </div>

          <div class="control-group">
            <label for="route-end-time">End Time:</label>
            <input type="datetime-local" id="route-end-time" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="btn" onclick="window.locationTracker.routeManager.createRoute()" style="flex: 1;">
              Create Route
            </button>
            <button class="btn secondary" onclick="document.getElementById('route-creation-popup').remove()" style="flex: 1;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    // Populate device dropdown
    const select = document.getElementById('route-device-select');
    this.tracker.devices.forEach((info, deviceId) => {
      const option = document.createElement('option');
      option.value = deviceId;
      option.textContent = deviceId;
      select.appendChild(option);
    });

    // Set default times (last 24 hours)
    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    document.getElementById('route-start-time').value = this.formatDateTimeLocal(yesterday);
    document. getElementById('route-end-time'). value = this.formatDateTimeLocal(now);
  }

  startManualRouteDrawing() {
    const popup = document.createElement('div');
    popup.className = 'popup-menu active';
    popup.id = 'manual-route-popup';
    popup.style.zIndex = '10001';

    popup.innerHTML = `
      <div class="popup-content" style="max-width: 500px;">
        <div class="popup-header">
          <h2>✏️ Draw Route Manually</h2>
          <button class="popup-close" onclick="window.locationTracker.routeManager.cancelManualRoute()">×</button>
        </div>
        <div class="popup-body" style="padding: 30px;">
          <div class="card">
            <div class="card-body">
              <div class="control-group">
                <label for="manual-route-name">Route Name:</label>
                <input type="text" id="manual-route-name" placeholder="My Custom Route" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
              </div>

              <div class="control-group">
                <label for="manual-route-device">Associate with Device:</label>
                <select id="manual-route-device" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
                  <option value="">No device (manual route)</option>
                </select>
              </div>

              <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #3b82f6;">
                <p style="margin: 0; font-size: 13px; color: #1e40af;">
                  <strong>Instructions:</strong><br>
                  Click on the map to add points to your route. <br>
                  Double-click or press Enter to finish. <br>
                  Press Escape to cancel.
                </p>
              </div>

              <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="btn" onclick="window.locationTracker. routeManager.startDrawingOnMap()" style="flex: 1;">
                  🖊️ Start Drawing
                </button>
                <button class="btn secondary" onclick="window.locationTracker.routeManager.cancelManualRoute()" style="flex: 1;">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document. body.appendChild(popup);

    // Populate device dropdown
    const select = document.getElementById('manual-route-device');
    this.tracker.devices.forEach((info, deviceId) => {
      const option = document.createElement('option');
      option.value = deviceId;
      option.textContent = deviceId;
      select.appendChild(option);
    });
  }

  startDrawingOnMap() {
    if (this.tracker.uiManager) {
      this.tracker.uiManager.closeAllMenus();
    }
    this.manualDrawingMode = true;
    this.manualRoutePoints = [];
    this.manualRouteMarkers = [];

    // Hide the popup but keep data
    const popup = document.getElementById('manual-route-popup');
    if (popup) {
      popup.style.display = 'none';
    }

    this.map.getCanvas().style.cursor = 'crosshair';

    this.showNotification('Click on map to add route points.  Double-click to finish. ', 'info');

    // Setup click handler
    this.manualRouteClickHandler = (e) => {
      this.addManualRoutePoint(e. lngLat);
    };

    this.manualRouteDoubleClickHandler = (e) => {
      e.preventDefault();
      this.finishManualRoute();
    };

    this.map.on('click', this.manualRouteClickHandler);
    this.map.on('dblclick', this.manualRouteDoubleClickHandler);

    // Setup keyboard handlers
    this.manualRouteKeyHandler = (e) => {
      if (e.key === 'Enter' && this.manualDrawingMode) {
        this. finishManualRoute();
      } else if (e.key === 'Escape' && this.manualDrawingMode) {
        this.cancelManualRoute();
      }
    };

    document.addEventListener('keydown', this. manualRouteKeyHandler);
  }

  addManualRoutePoint(lngLat) {
    const point = [lngLat.lng, lngLat.lat];
    this.manualRoutePoints. push(point);

    // Add marker
    const marker = new maplibregl.Marker({ color: '#f59e0b' })
      . setLngLat(point)
      .addTo(this. map);
    this.manualRouteMarkers. push(marker);

    // Update temp line
    this.updateManualRouteLine();

    this.showNotification(
      `${this.manualRoutePoints.length} point${this.manualRoutePoints. length !== 1 ? 's' : ''} added`,
      'info',
      2000
    );
  }

  updateManualRouteLine() {
    const sourceId = 'manual-route-temp';

    if (! this.map.getSource(sourceId)) {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      this.map.addLayer({
        id: 'manual-route-temp-line',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#f59e0b',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      });
    }

    this.map.getSource(sourceId).setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: this.manualRoutePoints
      }
    });
  }

  async finishManualRoute() {
    if (this.manualRoutePoints.length < 2) {
      this.showNotification('Need at least 2 points to create a route', 'error');
      return;
    }

    const routeName = document.getElementById('manual-route-name')?.value || 'Manual Route';
    const deviceId = document.getElementById('manual-route-device')?.value || 'manual';

    // Calculate distance
    let distance = 0;
    for (let i = 0; i < this.manualRoutePoints.length - 1; i++) {
      const p1 = this.manualRoutePoints[i];
      const p2 = this.manualRoutePoints[i + 1];
      distance += this.calculatePointDistance(p1, p2);
    }

    // Create route object locally
    const newRoute = {
      id: Date.now(), // Temporary ID
      device_id: deviceId,
      route_name: routeName,
      coordinates: this.manualRoutePoints,
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      distance_meters: distance,
      created_at: new Date().toISOString()
    };

    // Store locally (since this is manual, not from DB)
    this.routes.set(newRoute.id, newRoute);
    this.visibleRoutes.add(newRoute.id);
    this.drawRoute(newRoute);

    this.cleanupManualDrawing();
    this.updateRouteList();
    this.updateRouteStats();

    this.showNotification(`✓ Manual route "${routeName}" created`, 'success');
    this. focusRoute(newRoute.id);
  }

  calculatePointDistance(p1, p2) {
    const R = 6371000; // Earth radius in meters
    const lat1 = p1[1] * Math.PI / 180;
    const lat2 = p2[1] * Math.PI / 180;
    const dLat = (p2[1] - p1[1]) * Math.PI / 180;
    const dLng = (p2[0] - p1[0]) * Math. PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math. sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  cancelManualRoute() {
    this.cleanupManualDrawing();
    this.showNotification('Manual route drawing cancelled', 'info');
  }

  cleanupManualDrawing() {
    this.manualDrawingMode = false;
    this.manualRoutePoints = [];

    // Remove markers
    if (this.manualRouteMarkers) {
      this.manualRouteMarkers.forEach(m => m.remove());
      this.manualRouteMarkers = [];
    }

    // Remove temp line
    if (this.map.getLayer('manual-route-temp-line')) {
      this.map. removeLayer('manual-route-temp-line');
    }
    if (this.map.getSource('manual-route-temp')) {
      this.map.removeSource('manual-route-temp');
    }

    // Remove event handlers
    if (this.manualRouteClickHandler) {
      this.map.off('click', this.manualRouteClickHandler);
      this.manualRouteClickHandler = null;
    }

    if (this.manualRouteDoubleClickHandler) {
      this.map.off('dblclick', this.manualRouteDoubleClickHandler);
      this.manualRouteDoubleClickHandler = null;
    }

    if (this.manualRouteKeyHandler) {
      document.removeEventListener('keydown', this. manualRouteKeyHandler);
      this.manualRouteKeyHandler = null;
    }

    this.map.getCanvas().style. cursor = '';

    // Remove popup
    const popup = document. getElementById('manual-route-popup');
    if (popup) {
      popup.remove();
    }
  }

  formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  async createRoute() {
    const deviceId = document.getElementById('route-device-select').value;
    const routeName = document.getElementById('route-name-input').value;
    const startTime = document.getElementById('route-start-time').value;
    const endTime = document.getElementById('route-end-time').value;

    if (!deviceId) {
      alert('Please select a device');
      return;
    }

    if (!startTime || !endTime) {
      alert('Please select start and end times');
      return;
    }

    const routeData = {
      device_id: deviceId,
      route_name: routeName || `Route ${new Date().toLocaleString()}`,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString()
    };

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeData)
      });

      if (response.ok) {
        const newRoute = await response.json();
        this.routes.set(newRoute.id, newRoute);
        this.visibleRoutes.add(newRoute.id);
        this.drawRoute(newRoute);
        this.updateRouteList();
        this.updateRouteStats();

        document.getElementById('route-creation-popup').remove();
        this.showNotification(`✓ Route "${routeData.route_name}" created successfully`, 'success');

        // Focus on the new route
        setTimeout(() => this.focusRoute(newRoute.id), 500);
      } else {
        const errorText = await response.text();
        alert(`Failed to create route: ${errorText}`);
      }
    } catch (error) {
      console.error('Error creating route:', error);
      alert(`Error: ${error.message}`);
    }
    this.updateRouteLegend();
  }

  async deleteRoute(routeId) {
    const route = this.routes.get(routeId);
    if (!route) return;

    if (!confirm(`Are you sure you want to delete route "${route.route_name || 'Unnamed'}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/routes/${routeId}`, {
        method: 'DELETE'
      });

      if (response.ok || response.status === 204) {
        const sourceId = `route-${routeId}`;
        if (this.map.getLayer(sourceId)) {
          this.map.removeLayer(sourceId);
        }
        if (this.map.getSource(sourceId)) {
          this.map.removeSource(sourceId);
        }

        this.routes.delete(routeId);
        this.visibleRoutes.delete(routeId);
        this.updateRouteList();
        this.updateRouteStats();

        this.showNotification(`✓ Route deleted`, 'success');
      } else {
        alert('Failed to delete route');
      }
    } catch (error) {
      console.error('Error deleting route:', error);
      alert(`Error: ${error.message}`);
    }
  }

  toggleRouteVisibility(routeId, visible) {
    if (visible) {
      this.visibleRoutes.add(routeId);
    } else {
      this.visibleRoutes.delete(routeId);
    }

    const sourceId = `route-${routeId}`;
    const visibility = visible && this.showRoutes ? 'visible' : 'none';

    if (this.map.getLayer(sourceId)) {
      this.map.setLayoutProperty(sourceId, 'visibility', visibility);
    }
  }

  toggleAllRoutesVisibility() {
    this.showRoutes = !this.showRoutes;

    this.routes.forEach((route, id) => {
      const sourceId = `route-${id}`;
      const isVisible = this.visibleRoutes.has(id) && this.showRoutes;
      const visibility = isVisible ? 'visible' : 'none';

      if (this.map.getLayer(sourceId)) {
        this.map.setLayoutProperty(sourceId, 'visibility', visibility);
      }
    });

    this.showNotification(
      this.showRoutes ? 'Routes visible' : 'Routes hidden',
      'info'
    );
  }

  focusRoute(routeId) {
    const route = this.routes.get(routeId);
    if (!route || !route.coordinates) return;

    const bounds = new maplibregl.LngLatBounds();
    route.coordinates.forEach(coord => {
      bounds.extend(coord);
    });

    this.map.fitBounds(bounds, {
      padding: 100,
      duration: 1000
    });
  }

  updateRouteList() {
    const container = document.getElementById('route-items');
    if (!container) return;

    if (this.routes.size === 0) {
      container.innerHTML = `
        <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 20px;">
          <span id="no-routes-msg">No routes created yet</span>
        </div>
      `;
      return;
    }

    const items = Array.from(this.routes.values()).map(route => {
      const distanceKm = (route.distance_meters / 1000).toFixed(2);
      const color = this.routeColors[route.id % this.routeColors.length];

      return `
        <div class="route-list-item" style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 10px; background: #f9fafb; cursor: pointer; transition: all 0.2s; border-left: 4px solid ${color};"
             onclick="window.locationTracker.routeManager.focusRoute(${route.id})">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div style="flex: 1;">
              <h5 style="margin: 0 0 4px 0; color: #374151; font-size: 14px; font-weight: 600;">
                ${route.route_name || 'Unnamed Route'}
              </h5>
              <p style="margin: 0; color: #6b7280; font-size: 11px;">
                Device: ${route.device_id}
              </p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 11px; color: #6b7280;">
            <div>
              <strong>Distance:</strong> ${distanceKm} km
            </div>
            <div>
              <strong>Duration:</strong> ${this.calculateDuration(route.start_time, route.end_time)}
            </div>
          </div>

          <div style="margin-top: 8px; font-size: 10px; color: #9ca3af;">
            ${new Date(route.start_time).toLocaleDateString()}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = items;

    // Also update panel list
    this.updatePanelRouteList();
  }

  updatePanelRouteList() {
    const container = document.getElementById('route-panel-items');
    if (!container) return;

    // Update stats
    const totalElement = document.getElementById('panel-total-routes-count');
    if (totalElement) {
      totalElement.textContent = this.routes.size;
    }

    let totalDistance = 0;
    this.routes.forEach(route => {
      totalDistance += route.distance_meters || 0;
    });

    const distanceElement = document.getElementById('panel-total-distance-count');
    if (distanceElement) {
      distanceElement. textContent = `${(totalDistance / 1000).toFixed(1)} km`;
    }

    if (this.routes.size === 0) {
      container.innerHTML = `
        <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 20px;">
          <span>${this.tracker.t('noRoutesCreated')}</span>
        </div>
      `;
      return;
    }

    const items = Array.from(this.routes.values()). map(route => {
      const distanceKm = (route.distance_meters / 1000).toFixed(1);
      const color = this.routeColors[route.id % this.routeColors.length];
      const isVisible = this.visibleRoutes. has(route.id);

      return `
        <div class="route-list-item ${isVisible ? '' : 'dimmed'}" style="border-left-color: ${color};">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <input type="checkbox"
                  class="route-visibility-checkbox"
                  ${isVisible ? 'checked' : ''}
                  onclick="event.stopPropagation(); window.locationTracker.routeManager.toggleRouteIndividualVisibility(${route.id}, this.checked)"
                  title="${isVisible ? 'Hide route' : 'Show route'}">
            <div style="width: 12px; height: 12px; border-radius: 3px; background: ${color}; flex-shrink: 0;"></div>
            <div style="flex: 1;" onclick="window.locationTracker.routeManager.focusRoute(${route.id})">
              <h5 style="margin: 0; font-size: 13px; font-weight: 600; color: #374151;">
                ${route.route_name || 'Unnamed Route'}
              </h5>
            </div>
          </div>
          <div style="font-size: 11px; color: #6b7280; cursor: pointer;" onclick="window.locationTracker. routeManager.focusRoute(${route.id})">
            ${distanceKm} km • ${route.device_id}
          </div>
        </div>
      `;
    }). join('');

    container.innerHTML = items;
  }

  updateRouteStats() {
    const totalElement = document.getElementById('total-routes-count');
    if (totalElement) {
      totalElement.textContent = this.routes.size;
    }

    let totalDistance = 0;
    this.routes.forEach(route => {
      totalDistance += route.distance_meters || 0;
    });

    const distanceElement = document.getElementById('total-distance-count');
    if (distanceElement) {
      distanceElement.textContent = `${(totalDistance / 1000).toFixed(1)} km`;
    }
  }

  showNotification(message, type = 'info') {
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
    }, 3000);
  }

  toggleRouteLegend() {
    this.routeLegendCollapsed = !this.routeLegendCollapsed;
    const legend = document.getElementById('route-legend-panel');

    if (this.routeLegendCollapsed) {
      legend.classList.add('collapsed');
    } else {
      legend.classList.remove('collapsed');
    }
  }

  updateRouteLegend() {
    const container = document.getElementById('route-legend-items');
    const countElement = document.getElementById('route-count');

    if (countElement) {
      countElement.textContent = this.routes.size;
    }

    if (!container) return;

    if (this.routes.size === 0) {
      container.innerHTML = `<div style="color: #9ca3af; font-size: 12px;">${this.tracker.t('noRoutesCreated') || 'No routes created yet'}</div>`;
      return;
    }

    container.innerHTML = '';

    this.routes.forEach((route, id) => {
      const distanceKm = (route.distance_meters / 1000).toFixed(1);
      const isVisible = this.visibleRoutes.has(id);
      const color = this.routeColors[id % this.routeColors.length];

      const item = document.createElement('div');
      item.className = 'route-legend-item';

      item.innerHTML = `
        <input type="checkbox" class="route-checkbox" ${isVisible ? 'checked' : ''}
              data-route="${id}">
        <div class="route-icon" style="background: ${color};">🛣️</div>
        <div class="route-info">
          <div class="route-name">${route.route_name || 'Unnamed Route'}</div>
          <div class="route-details">
            <span>${distanceKm} km</span>
            <span>${route.device_id}</span>
          </div>
        </div>
      `;

      const checkbox = item.querySelector('.route-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleRouteVisibility(id, checkbox.checked);
      });

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          this.focusRoute(id);
        }
      });

      container.appendChild(item);
    });
  }

  toggleRouteIndividualVisibility(routeId, visible) {
    console.log(`Toggling route ${routeId} visibility to ${visible}`);

    if (visible) {
      this.visibleRoutes.add(routeId);
    } else {
      this.visibleRoutes.delete(routeId);
    }

    const sourceId = `route-${routeId}`;
    const shouldBeVisible = visible && this.showRoutes;
    const visibility = shouldBeVisible ? 'visible' : 'none';

    console.log(`Setting ${sourceId} visibility to ${visibility}`);

    if (this.map. getLayer(sourceId)) {
      this.map.setLayoutProperty(sourceId, 'visibility', visibility);
    }

    // Update UI
    this.updateRouteLegend();
    this.updatePanelRouteList();
  }

  toggleRouteVisibility(routeId, visible) {
    if (visible) {
      this.visibleRoutes.add(routeId);
    } else {
      this.visibleRoutes.delete(routeId);
    }

    const sourceId = `route-${routeId}`;
    const visibility = visible && this.showRoutes ? 'visible' : 'none';

    if (this.map.getLayer(sourceId)) {
      this.map.setLayoutProperty(sourceId, 'visibility', visibility);
    }

    this.updateRouteLegend();
  }

  centerOnRoutes() {
    const visibleRoutes = Array.from(this.visibleRoutes);

    if (visibleRoutes.length === 0) {
      console.log('No visible routes to center on');
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    visibleRoutes.forEach(id => {
      const route = this.routes.get(id);
      if (route && route.coordinates) {
        route.coordinates.forEach(coord => {
          bounds.extend(coord);
        });
      }
    });

    this.map.fitBounds(bounds, {
      padding: 100,
      duration: 800
    });
  }
}
