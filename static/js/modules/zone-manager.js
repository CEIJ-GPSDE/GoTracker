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
      btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type));
    });

    this.updateView();
  }

  updateView() {
    const actionsContainer = document.getElementById('zone-actions');
    const statsContainer = document.getElementById('zone-stats');
    const listContainer = document.getElementById('zone-list-items');

    if (this.activeType === 'geofence') {
      // Show Geofence Controls
      actionsContainer.innerHTML = `
        <button class="panel-action-btn" onclick="window.locationTracker.geofenceManager?.startDrawing()">🖊️ Draw New</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.geofenceManager?.createGeofenceFromRoute()">🛣️ From Route</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.geofenceManager?.toggleAllGeofencesVisibility()">👁️ Toggle</button>
      `;

      // Update List using existing manager
      if (this.tracker.geofenceManager) {
        // Redirect the output of the manager to our shared container
        // We temporarily override the ID target in the manager or update the manager to accept a target
        // For quick integration, we assume the manager looks for specific IDs, so we might need to alias them
        // OR better: call the update methods which update specific IDs, so we just ensure those IDs exist in the shared view?
        // Actually, the HTML structure in Index.html replaced the specific IDs.
        // We need to update GeofenceManager to target 'zone-list-items' when in this mode or map IDs.

        // Simpler approach: Render manually here calling manager data
        this.tracker.geofenceManager.updatePanelGeofenceList('zone-list-items');
      }
    } else {
      // Show Route Controls
      actionsContainer.innerHTML = `
        <button class="panel-action-btn" onclick="window.locationTracker.routeManager?.startCreatingRoute()">📍 Create Route</button>
        <button class="panel-action-btn secondary" onclick="window.locationTracker.routeManager?.toggleAllRoutesVisibility()">👁️ Toggle</button>
      `;

      if (this.tracker.routeManager) {
        this.tracker.routeManager.updatePanelRouteList('zone-list-items');
      }
    }
  }
}
