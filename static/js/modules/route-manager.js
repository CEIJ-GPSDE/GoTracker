export class RouteManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.mapManager = locationTracker.mapManager;
    this.map = this.mapManager.map;
    this.routes = new Map();
    this.showRoutes = true;
    this.visibleRoutes = new Set();
    this.routeColors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
  }

  initialize() {
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
    const distanceKm = (route.distance_meters / 1000).toFixed(2);
    const duration = this.calculateDuration(route.start_time, route.end_time);

    new maplibregl.Popup({
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
    const popup = document.createElement('div');
    popup.className = 'popup-menu active';
    popup.id = 'route-creation-popup';
    popup.style.zIndex = '10001';
    
    popup.innerHTML = `
      <div class="popup-content" style="max-width: 500px;">
        <div class="popup-header">
          <h2>➕ Create Route from History</h2>
          <button class="popup-close" onclick="document.getElementById('route-creation-popup').remove()">×</button>
        </div>
        <div class="popup-body" style="padding: 30px;">
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
        </div>
      </div>
    `;
    
    document.body.appendChild(popup);
    
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
    document.getElementById('route-end-time').value = this.formatDateTimeLocal(now);
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
}
