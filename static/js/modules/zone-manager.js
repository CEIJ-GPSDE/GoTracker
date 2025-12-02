export class ZoneManager {
  constructor(tracker) {
    this.tracker = tracker;
    this.activeType = 'geofence'; // 'geofence' or 'route'
  }

  initialize() {
    this.updateView();
  }

  switchType(type) {
    this.activeType = type;

    // Update toggle buttons
    document.querySelectorAll('.zone-type-btn').forEach(btn => {
      btn.classList.remove('active');
      if (type === 'geofence' && btn.textContent.toLowerCase().includes('geofence')) {
        btn.classList.add('active');
      } else if (type === 'route' && btn.textContent.toLowerCase().includes('route')) {
        btn.classList.add('active');
      }
    });

    this.updateView();
  }

updateView() {
    const actionsContainer = document.getElementById('zone-actions');
    const listContainer = document.getElementById('zone-list-items');

    if (!actionsContainer || !listContainer) {
      console.warn('Zone containers not found');
      return;
    }

    if (this.activeType === 'geofence') {
      // Show Geofence Controls
      actionsContainer.innerHTML = `
        <button class="panel-action-btn" onclick="window.locationTracker.geofenceManager?.startDrawing()">🖊️ Draw New</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.geofenceManager?.toggleAllGeofencesVisibility()">👁️ Toggle</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.geofenceManager?.loadGeofences()">🔄 Reload</button>
      `;

      // Render geofences directly in the zone list container
      if (this.tracker.geofenceManager) {
        this.renderGeofenceList(listContainer);
      }
    } else {
      // Show Route Controls
      actionsContainer.innerHTML = `
        <button class="panel-action-btn" onclick="window.locationTracker.routeManager?.startCreatingRoute()">📍 Create Route</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.routeManager?.toggleAllRoutesVisibility()">👁️ Toggle</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.routeManager?.loadRoutes()">🔄 Reload</button>
      `;

      // Render routes directly in the zone list container
      if (this.tracker.routeManager) {
        this.renderRouteList(listContainer);
      }
    }
  }

  renderGeofenceList(container) {
    const geofenceManager = this.tracker.geofenceManager;

    if (geofenceManager.geofences.size === 0) {
      container.innerHTML = `
        <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 20px;">
          <span>${this.tracker.t('noGeofencesCreated')}</span>
        </div>
      `;
      return;
    }

    const items = Array.from(geofenceManager.geofences.values()).map(gf => {
      const devicesInside = geofenceManager.getDevicesInGeofence(gf.id);
      const color = gf.active ? '#667eea' : '#9ca3af';
      const isVisible = geofenceManager.visibleGeofences.has(gf.id);

      return `
        <div class="geofence-list-item ${!isVisible ? 'dimmed' : ''}" onclick="window.locationTracker.geofenceManager.focusGeofence(${gf.id})">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <input type="checkbox"
                  class="geofence-visibility-checkbox"
                  ${isVisible ? 'checked' : ''}
                  onclick="event.stopPropagation(); window.locationTracker.geofenceManager.toggleGeofenceVisibility(${gf.id}, this.checked)"
                  title="${isVisible ? 'Hide geofence' : 'Show geofence'}">
            <div style="width: 12px; height: 12px; border-radius: 3px; background: ${color}; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <h5 style="margin: 0; font-size: 13px; font-weight: 600; color: #374151;">
                ${gf.name}
              </h5>
            </div>
            <span style="font-size: 10px; color: ${gf.active ? '#10b981' : '#ef4444'}; font-weight: 600;">
              ${gf.active ? '✓' : '✗'}
            </span>
          </div>
          <div style="font-size: 11px; color: #6b7280;">
            ${devicesInside.length} device${devicesInside.length !== 1 ? 's' : ''} inside
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = items;
  }

  renderRouteList(container) {
    const routeManager = this.tracker.routeManager;

    if (routeManager.routes.size === 0) {
      container.innerHTML = `
        <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 20px;">
          <span>${this.tracker.t('noRoutesCreated')}</span>
        </div>
      `;
      return;
    }

    const items = Array.from(routeManager.routes.values()).map(route => {
      const distanceKm = (route.distance_meters / 1000).toFixed(1);
      const color = routeManager.routeColors[route.id % routeManager.routeColors.length];
      const isVisible = routeManager.visibleRoutes.has(route.id);

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
          <div style="font-size: 11px; color: #6b7280; cursor: pointer;" onclick="window.locationTracker.routeManager.focusRoute(${route.id})">
            ${distanceKm} km • ${route.device_id}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = items;
  }
}
