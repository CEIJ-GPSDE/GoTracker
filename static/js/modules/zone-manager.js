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

      if (this.tracker.geofenceManager) {
        this.tracker.geofenceManager.updatePanelGeofenceList();
      }
    } else {
      // Show Route Controls
      actionsContainer.innerHTML = `
        <button class="panel-action-btn" onclick="window.locationTracker.routeManager?.startCreatingRoute()">📍 Create Route</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.routeManager?.toggleAllRoutesVisibility()">👁️ Toggle</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.routeManager?.loadRoutes()">🔄 Reload</button>
      `;

      if (this.tracker.routeManager) {
        this.tracker.routeManager.updatePanelRouteList();
      }
    }
  }
}
