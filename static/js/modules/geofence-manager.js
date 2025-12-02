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
    this.geofenceViolations = new Map();
    this.showGeofences = true;
    this.devicesInsideGeofences = new Map();
    this.totalAlerts = 0;
    this.geofenceLegendCollapsed = false;
    this.visibleGeofences = new Set(); // Track which geofences are visible
  }

  initialize() {
    // ✅ Prevenir inicialización múltiple
    if (this.initialized) {
      console.log('GeofenceManager already initialized');
      return;
    }
    this.initialized = true;

    if (!this.map.getSource(this.tempLineSourceId)) {
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
    }

    // Load existing geofences
    this.loadGeofences();

    // Listen for location updates
    this.setupViolationDetection();

    // Update stats periodically
    setInterval(() => this.updateGeofenceStats(), 5000);

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
      // Check if click was on map background (not on a layer)
      const features = this.map.queryRenderedFeatures(e.point);
      const isGeofenceClick = features.some(f => f.source && f.source.startsWith('geofence-'));

      if (!isGeofenceClick && this.currentPopup) {
        this.currentPopup.remove();
        this.currentPopup = null;
      }
    });
    window.debugGeofences = () => {
      console.log('=== Geofence Debug Info ===');
      console.log('showGeofences (global):', this.showGeofences);
      console.log('visibleGeofences (individual):', Array.from(this.visibleGeofences));
      this.geofences.forEach((gf, id) => {
        const sourceId = `geofence-${id}`;
        const fillLayer = this.map.getLayer(`${sourceId}-fill`);
        const visibility = fillLayer ? this.map.getLayoutProperty(`${sourceId}-fill`, 'visibility') : 'N/A';
        console.log(`Geofence ${id} (${gf.name}):`, {
          active: gf.active,
          individuallyVisible: this.visibleGeofences.has(id),
          layerVisibility: visibility
        });
      });
    };
      console.log('Run window.debugGeofences() to see geofence state');
  }

  // Calculate convex hull using Graham's scan algorithm
  calculateConvexHull(points) {
    if (points.length < 3) return points;

    // Find the bottom-most point (or left-most in case of tie)
    let bottom = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i][1] < points[bottom][1] ||
          (points[i][1] === points[bottom][1] && points[i][0] < points[bottom][0])) {
        bottom = i;
      }
    }

    // Swap bottom point to first position
    [points[0], points[bottom]] = [points[bottom], points[0]];
    const pivot = points[0];

    // Sort points by polar angle with respect to pivot
    const sortedPoints = points.slice(1).sort((a, b) => {
      const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
      const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);

      if (angleA === angleB) {
        // If same angle, sort by distance
        const distA = Math.pow(a[0] - pivot[0], 2) + Math. pow(a[1] - pivot[1], 2);
        const distB = Math.pow(b[0] - pivot[0], 2) + Math.pow(b[1] - pivot[1], 2);
        return distA - distB;
      }

      return angleA - angleB;
    });

    // Build convex hull
    const hull = [pivot, sortedPoints[0]];

    for (let i = 1; i < sortedPoints.length; i++) {
      let top = hull[hull.length - 1];
      let nextToTop = hull[hull.length - 2];

      // Remove points that make clockwise turn
      while (hull.length > 1 && this.crossProduct(nextToTop, top, sortedPoints[i]) <= 0) {
        hull.pop();
        top = hull[hull.length - 1];
        nextToTop = hull[hull. length - 2];
      }

      hull.push(sortedPoints[i]);
    }

    return hull;
  }

  crossProduct(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  async loadGeofences() {
    // ✅ Prevenir carga múltiple simultánea
    if (this.isLoading) {
      console.log('Geofences already loading...');
      return;
    }

    this.isLoading = true;

    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/geofences`);
      if (response.ok) {
        const geofences = await response.json();
        this.geofences.clear();

        // Clear existing geofence layers
        this.clearAllGeofenceLayers();

        geofences.forEach(gf => {
          this.geofences.set(gf.id, gf);
          this.visibleGeofences.add(gf.id);
          this.drawGeofence(gf);
        });

        console.log(`✅ Loaded ${geofences.length} geofences`);
        this.updateGeofenceLegend();
        this.updateGeofenceList();
        this.updateGeofenceStats();

        // Check all current device locations against geofences
        this.checkAllDeviceLocations();
      } else {
        console.error('Failed to load geofences:', response.status);
      }
    } catch (error) {
      console.error('Error loading geofences:', error);
    } finally {
      this.isLoading = false;
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
          name: geofence.name,
          active: geofence.active
        },
        geometry: {
          type: 'Polygon',
          coordinates: [geofence.coordinates]
        }
      }
    });

    // FIX: Check BOTH individual visibility AND global showGeofences flag
    const isIndividuallyVisible = this.visibleGeofences.has(geofence.id);
    const isVisible = isIndividuallyVisible && this.showGeofences;
    const baseColor = geofence.color || '#667eea';

    // Validate hex color (basic check)
    const validColor = /^#[0-9A-F]{6}$/i.test(baseColor) ? baseColor : '#667eea';

    this.map.addLayer({
      id: `${sourceId}-fill`,
      type: 'fill',
      source: sourceId,
      layout: { 'visibility': isVisible ? 'visible' : 'none' },
      paint: {
        'fill-color': validColor, // ✅ Pass the value directly
        'fill-opacity': 0.2
      }
    });

    // Determine outline color
    const outlineColor = validColor; // Use the same color as fill, or choose a darker shade

    // Add outline layer with dashed pattern for inactive
    this.map.addLayer({
      id: `${sourceId}-outline`,
      type: 'line',
      source: sourceId,
      layout: {
        'visibility': isVisible ? 'visible' : 'none'
      },
      paint: {
        'line-color': outlineColor,
        'line-width': 2,
        'line-dasharray': geofence.active ? [1, 0] : [2, 2]
      }
    });

    // Remove old handlers before adding new ones
    this.map.off('click', `${sourceId}-fill`);
    this.map.off('mouseenter', `${sourceId}-fill`);
    this.map.off('mouseleave', `${sourceId}-fill`);

    // Add click handler
    this.map.on('click', `${sourceId}-fill`, (e) => {
      this.showGeofencePopup(geofence, e.lngLat);
    });

    // Add hover handlers
    this.map.on('mouseenter', `${sourceId}-fill`, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', `${sourceId}-fill`, () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  showGeofencePopup(geofence, lngLat) {
    // CLOSE any existing popup first
    if (this.currentPopup) {
      this.currentPopup.remove();
    }

    const devicesInside = this.getDevicesInGeofence(geofence.id);
    const devicesList = devicesInside.length > 0
      ? devicesInside.map(d => `<li style="margin: 2px 0;">${d}</li>`).join('')
      : `<li style="color: #9ca3af;">${this.tracker.t('noDevicesFound')}</li>`;

    const areaKm2 = this.calculateGeofenceArea(geofence.coordinates);

    this.currentPopup = new maplibregl.Popup({
      maxWidth: '300px',
      closeButton: true,
      closeOnClick: false
    })
      .setLngLat(lngLat)
      .setHTML(`
        <div style="font-family: system-ui; min-width: 250px; max-width: 300px;">
          <h4 style="margin: 0 0 10px 0; color: #667eea; word-wrap: break-word;">
            🗺️ ${geofence.name}
          </h4>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px; word-wrap: break-word;">
            ${geofence.description || this.tracker.t('noDescription') || 'No description'}
          </div>
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
            ${this.tracker.t('geofenceArea')}: ${areaKm2.toFixed(2)} ${this.tracker.t('geofenceAreaKm')}
          </div>
          <div style="font-size: 11px; margin-bottom: 8px;">
            <strong>${this.tracker.t('geofenceStatus')}:</strong>
            <span style="color: ${geofence.active ? '#10b981' : '#ef4444'};">
              ${geofence.active ? '✔ ' + this.tracker.t('activeGeofences') : '✗ ' + this.tracker.t('inactive')}
            </span>
          </div>
          <div style="font-size: 11px; margin-bottom: 10px;">
            <strong>${this.tracker.t('devicesInside')} (${devicesInside.length}):</strong>
            <ul style="margin: 5px 0; padding-left: 20px; max-height: 80px; overflow-y: auto;">
              ${devicesList}
            </ul>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
            <button
              onclick="window.locationTracker.geofenceManager.toggleGeofenceActive(${geofence.id})"
              style="width: 100%; padding: 8px 12px; background: ${geofence.active ? '#f59e0b' : '#10b981'}; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
              ${geofence.active ? this.tracker.t('deactivateGeofence') : this.tracker.t('activateGeofence')}
            </button>
            <button
              onclick="window.locationTracker.geofenceManager.deleteGeofence(${geofence.id})"
              style="width: 100%; padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
              🗑️ ${this.tracker.t('deleteGeofence')}
            </button>
          </div>
        </div>
      `)
      .addTo(this.map);

    // ADD: Track when popup is closed
    this.currentPopup.on('close', () => {
      this.currentPopup = null;
    });
  }

  calculateGeofenceArea(coordinates) {
    // Validate coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
      return 0;
    }

    let area = 0;
    const n = coordinates.length - 1;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!coordinates[i] || !coordinates[j] ||
          coordinates[i].length < 2 || coordinates[j].length < 2) {
        continue;
      }
      area += coordinates[i][0] * coordinates[j][1];
      area -= coordinates[j][0] * coordinates[i][1];
    }

    area = Math.abs(area) / 2;
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

        // UPDATE: Store the updated geofence
        this.geofences.set(geofenceId, updated);

        // FIX: Force complete redraw of this specific geofence
        const sourceId = `geofence-${geofenceId}`;

        // Remove existing layers and source
        if (this.map.getLayer(`${sourceId}-fill`)) {
          this.map.removeLayer(`${sourceId}-fill`);
        }
        if (this.map.getLayer(`${sourceId}-outline`)) {
          this.map.removeLayer(`${sourceId}-outline`);
        }
        if (this.map.getSource(sourceId)) {
          this.map.removeSource(sourceId);
        }

        // Redraw with new state
        this.drawGeofence(updated);

        // Update all UI components
        this.updateGeofenceLegend();
        this.updateGeofenceList();
        this.updatePanelGeofenceList();

        await this.loadGeofences();

        // Close any open popups
        const popups = document.querySelectorAll('.maplibregl-popup');
        popups.forEach(popup => popup.remove());

        // Also close tracked popup
        if (this.currentPopup) {
          this.currentPopup.remove();
          this.currentPopup = null;
        }
        this.showNotification(
          `${this.tracker.t('geofence')} "${geofence.name}" ${updated.active ? this.tracker.t('activated') : this.tracker.t('deactivated')}`,
          'success'
        );
        this.loadGeofences();
        console.log(`Geofence ${geofenceId} toggled to ${updated.active ? 'active' : 'inactive'}`);
      }
    } catch (error) {
      console.error('Error toggling geofence:', error);
      this.showNotification(`Error: ${error.message}`, 'error');
    }
  }

  toggleGeofenceVisibility(geofenceId, visible) {
    console.log(`Toggling geofence ${geofenceId} visibility to ${visible}`);
    if (visible) {
      this.visibleGeofences.add(geofenceId);
    } else {
      this.visibleGeofences.delete(geofenceId);
    }

    const sourceId = `geofence-${geofenceId}`;
    // Check both individual visibility AND global showGeofences flag
    const shouldBeVisible = visible && this.showGeofences;
    const visibility = shouldBeVisible ? 'visible' : 'none';

    console.log(`Setting ${sourceId} visibility to ${visibility}`);

    if (this.map.getLayer(`${sourceId}-fill`)) {
      this.map.setLayoutProperty(`${sourceId}-fill`, 'visibility', visibility);
    }
    if (this.map.getLayer(`${sourceId}-outline`)) {
      this.map.setLayoutProperty(`${sourceId}-outline`, 'visibility', visibility);
    }

    // Update UI checkboxes without reloading data
    this.updateGeofenceLegend();
    this.updatePanelGeofenceList();
  }

  toggleAllGeofencesVisibility() {
    // Toggle the global flag
    this.showGeofences = !this.showGeofences;

    console.log(`Toggling ALL geofences to ${this.showGeofences ? 'visible' : 'hidden'}`);

    // Update visibility for ALL geofences based on both flags
    this.geofences.forEach((gf, id) => {
      const sourceId = `geofence-${id}`;

      // Respect BOTH individual visibility preference AND global flag
      const isIndividuallyVisible = this.visibleGeofences.has(id);
      const shouldBeVisible = isIndividuallyVisible && this.showGeofences;
      const visibility = shouldBeVisible ? 'visible' : 'none';

      if (this.map.getLayer(`${sourceId}-fill`)) {
        this.map.setLayoutProperty(`${sourceId}-fill`, 'visibility', visibility);
      }
      if (this.map.getLayer(`${sourceId}-outline`)) {
        this.map.setLayoutProperty(`${sourceId}-outline`, 'visibility', visibility);
      }
    });

    // Update button state
    const btn = document.getElementById('toggle-geofences-btn');
    if (btn) {
      btn.classList.toggle('active', !this.showGeofences);
      btn.title = this.showGeofences ? this.tracker.t('hideGeofences') : this.tracker.t('showGeofences');
    }

    this.showNotification(
      this.showGeofences ? this.tracker.t('geofencesVisible') : this.tracker.t('geofencesHidden'),
      'info'
    );
  }

  toggleGeofenceLegend() {
    this.geofenceLegendCollapsed = !this.geofenceLegendCollapsed;
    const legend = document.getElementById('geofence-legend');

    if (this.geofenceLegendCollapsed) {
      legend.classList.add('collapsed');
    } else {
      legend.classList.remove('collapsed');
    }
  }

  centerOnGeofences() {
    const visibleGeofences = Array.from(this.visibleGeofences).filter(id => {
      const geofence = this.geofences.get(id);
      return geofence && geofence.active;
    });

    if (visibleGeofences.length === 0) {
      console.log('No visible geofences to center on');
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    visibleGeofences.forEach(id => {
      const geofence = this.geofences.get(id);
      if (geofence && geofence.coordinates) {
        geofence.coordinates.forEach(coord => {
          bounds.extend(coord);
        });
      }
    });

    this.map.fitBounds(bounds, {
      padding: 100,
      duration: 800
    });
  }

  updateGeofenceLegend() {
    const container = document.getElementById('geofence-legend-items');
    const countElement = document.getElementById('geofence-count');

    if (countElement) {
      countElement.textContent = this.geofences.size;
    }

    if (!container) return;

    if (this.geofences.size === 0) {
      container.innerHTML = `<div style="color: #9ca3af; font-size: 12px;">${this.tracker.t('noGeofencesCreated')}</div>`;
      return;
    }

    container.innerHTML = '';

    this.geofences.forEach((geofence, id) => {
      const devicesInside = this.getDevicesInGeofence(id);
      const isVisible = this.visibleGeofences.has(id);

      const item = document.createElement('div');
      item.className = `geofence-legend-item ${!geofence.active ? 'inactive' : ''}`;

      item.innerHTML = `
        <input type="checkbox" class="geofence-checkbox" ${isVisible ? 'checked' : ''}
              data-geofence="${id}">
        <div class="geofence-icon ${!geofence.active ? 'inactive' : ''}">🗺️</div>
        <div class="geofence-info">
          <div class="geofence-name">${geofence.name}</div>
          <div class="geofence-details">
            <span>${devicesInside.length} 📱</span>
            <span>${geofence.active ? '✔' : '✗'}</span>
          </div>
        </div>
      `;

      const checkbox = item.querySelector('.geofence-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        console.log(`Checkbox changed for geofence ${id}: ${checkbox.checked}`);
        // FIX: Explicitly pass the geofence ID, not rely on closure
        window.locationTracker.geofenceManager.toggleGeofenceVisibility(id, checkbox.checked);
      });

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          this.focusGeofence(id);
        }
      });

      container.appendChild(item);
    });
  }

  startDrawing() {
    if (this.drawingMode) {
      this.cancelDrawing();
      return;
    }

    // Close all open menus so the user is immediately on the map
    if (this.tracker.uiManager) {
      this.tracker.uiManager.closeAllMenus();
    }

    this.drawingMode = true;
    this.drawingPoints = [];
    this.clearDrawingMarkers();

    this.map.getCanvas().style.cursor = 'crosshair';

    const btn = document.getElementById('draw-geofence-btn');
    if (btn) {
      btn.classList.add('active');
    }

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

    const btn = document.getElementById('draw-geofence-btn');
    if (btn) {
      btn.classList.remove('active');
    }

    this.showNotification(this.tracker.t('drawingCancelled'), 'info');
  }

  handleMapClick(e) {
    if (! this.drawingMode) return;

    const point = [e.lngLat.lng, e.lngLat. lat];
    this.drawingPoints.push(point);

    const marker = new maplibregl. Marker({ color: '#667eea' })
      .setLngLat(point)
      .addTo(this.map);
    this.drawingMarkers.push(marker);

    // ✅ CHANGED: Calculate and display convex hull
    if (this.drawingPoints.length >= 3) {
      const hull = this.calculateConvexHull([...this.drawingPoints]);
      this.updateTempLine(hull);
    } else {
      this.updateTempLine();
    }

    if (this.drawingPoints.length >= 3) {
      this. showNotification(
        `${this.drawingPoints.length} ${this.tracker.t('pointsAdded')}.  ${this.tracker.t('doubleClickToFinish')}`,
        'info',
        2000
      );
    } else {
      this.showNotification(
        `${this. drawingPoints.length} ${this.tracker.t('pointsAdded')}.  ${this.tracker.t('minimumPoints')}`,
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

  updateTempLine(hullPoints = null) {
    // Use hull points if provided, otherwise use original drawing points
    const displayPoints = hullPoints || this. drawingPoints;

    if (displayPoints.length < 2) {
      this.map.getSource(this.tempLineSourceId).setData({
        type: 'FeatureCollection',
        features: []
      });
      return;
    }

    const lineCoords = [... displayPoints];
    if (displayPoints.length >= 3) {
      lineCoords.push(displayPoints[0]); // Close the polygon
    }

    this.map.getSource(this. tempLineSourceId).setData({
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
    if (this.drawingPoints. length < 3) {
      this.showNotification(this.tracker.t('minimumPoints'), 'error');
      return;
    }

    const name = prompt(this.tracker.t('enterGeofenceName'), `${this.tracker.t('geofence')} ${Date.now()}`);
    if (!name) {
      this.cancelDrawing();
      return;
    }

    const description = prompt(this.tracker.t('enterDescription'), '');
    const linkDevice = prompt("Link to specific Device ID? (Leave empty for all)", "");
    const colorInput = prompt("Color (hex code e.g. #ff0000) or leave empty for default:", "#667eea");
    const hullPoints = this.calculateConvexHull([...this.drawingPoints]);
    const coordinates = [... hullPoints, hullPoints[0]]; // Close the polygon

    const geofenceData = {
      name: name,
      description: description || `${this.tracker.t('created')} ${new Date().toLocaleString()}`,
      coordinates: coordinates,
      linked_device_id: linkDevice, // Send to backend
      color: colorInput             // Send to backend
    };

    try {
      const response = await fetch(`${this. tracker.config.apiBaseUrl}/api/geofences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geofenceData)
      });

      if (response.ok) {
        const newGeofence = await response.json();
        this.geofences.set(newGeofence.id, newGeofence);
        this.visibleGeofences.add(newGeofence.id);
        this.drawGeofence(newGeofence);
        this. showNotification(`✓ ${this.tracker.t('geofenceCreated')}: "${name}"`, 'success');
        this.cancelDrawing();
        this.updateGeofenceLegend();
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

  async createGeofenceFromRoute(routeId = null) {
    const popup = document.createElement('div');
    popup.className = 'popup-menu active';
    popup.id = 'geofence-from-route-popup';
    popup.style.zIndex = '10001';

    popup.innerHTML = `
      <div class="popup-content" style="max-width: 500px;">
        <div class="popup-header">
          <h2>🛣️ Create Geofence from Route</h2>
          <button class="popup-close" onclick="document.getElementById('geofence-from-route-popup').remove()">×</button>
        </div>
        <div class="popup-body" style="padding: 30px;">
          <div class="card">
            <div class="card-body">
              <div class="control-group">
                <label for="geofence-route-select">Select Route:</label>
                <select id="geofence-route-select" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
                  <option value="">Choose a route... </option>
                </select>
              </div>

              <div class="control-group">
                <label for="geofence-route-name">Geofence Name:</label>
                <input type="text" id="geofence-route-name" placeholder="Route Corridor" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
              </div>

              <div class="control-group">
                <label for="geofence-route-radius">Buffer Radius (meters):</label>
                <input type="number" id="geofence-route-radius" value="100" min="10" max="5000" step="10" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
                <small style="color: #6b7280; font-size: 12px;">Creates a buffer zone around the route</small>
              </div>

              <div class="control-group">
                <label for="geofence-route-shape">Buffer Shape:</label>
                <select id="geofence-route-shape" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px;">
                  <option value="round">Round (smoother)</option>
                  <option value="square">Square (simpler)</option>
                </select>
              </div>

              <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="btn" onclick="window.locationTracker.geofenceManager. generateGeofenceFromRoute()" style="flex: 1;">
                  Create Geofence
                </button>
                <button class="btn secondary" onclick="document.getElementById('geofence-from-route-popup').remove()" style="flex: 1;">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    // Populate route dropdown
    const select = document.getElementById('geofence-route-select');
    if (this.tracker.routeManager) {
      this.tracker.routeManager.routes.forEach((route, id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = route.route_name || `Route ${id}`;
        if (routeId && id === routeId) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }
  }

  async generateGeofenceFromRoute() {
    const routeId = parseInt(document.getElementById('geofence-route-select').value);
    const name = document.getElementById('geofence-route-name').value;
    const radius = parseFloat(document.getElementById('geofence-route-radius').value);
    const shape = document.getElementById('geofence-route-shape').value;

    if (!routeId || ! name) {
      this.showNotification('Please select a route and enter a name', 'error');
      return;
    }

    const route = this.tracker.routeManager.routes.get(routeId);
    if (!route || !route.coordinates || route.coordinates.length < 2) {
      this.showNotification('Invalid route selected', 'error');
      return;
    }

    // Generate buffer points around route
    const bufferPoints = this.createRouteBuffer(route. coordinates, radius, shape);

    // Calculate convex hull of buffer points
    const hullPoints = this.calculateConvexHull(bufferPoints);
    const coordinates = [... hullPoints, hullPoints[0]]; // Close polygon

    const geofenceData = {
      name: name,
      description: `Generated from route with ${radius}m ${shape} buffer`,
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
        this.visibleGeofences.add(newGeofence.id);
        this.drawGeofence(newGeofence);

        document.getElementById('geofence-from-route-popup').remove();

        this.showNotification(`✓ Geofence "${name}" created from route`, 'success');
        this.updateGeofenceLegend();
        this.updateGeofenceList();
        this.updateGeofenceStats();

        // Focus on new geofence
        setTimeout(() => this.focusGeofence(newGeofence.id), 500);
      } else {
        const errorText = await response.text();
        this.showNotification(`Error: ${errorText}`, 'error');
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error');
    }
  }

  createRouteBuffer(routeCoords, radiusMeters, shape) {
    const bufferPoints = [];
    const pointsPerSegment = shape === 'round' ? 8 : 4;

    // Convert radius from meters to degrees (approximate)
    const radiusDegrees = radiusMeters / 111320; // 1 degree ≈ 111. 32 km at equator

    routeCoords.forEach((coord, idx) => {
      if (shape === 'round') {
        // Add circular buffer points around each coordinate
        for (let i = 0; i < pointsPerSegment; i++) {
          const angle = (i / pointsPerSegment) * 2 * Math.PI;
          const offsetLng = radiusDegrees * Math.cos(angle) / Math.cos(coord[1] * Math.PI / 180);
          const offsetLat = radiusDegrees * Math.sin(angle);

          bufferPoints.push([
            coord[0] + offsetLng,
            coord[1] + offsetLat
          ]);
        }
      } else {
        // Square buffer (4 corners)
        const offsetLng = radiusDegrees / Math.cos(coord[1] * Math. PI / 180);
        const offsetLat = radiusDegrees;

        bufferPoints.push(
          [coord[0] - offsetLng, coord[1] - offsetLat], // SW
          [coord[0] + offsetLng, coord[1] - offsetLat], // SE
          [coord[0] + offsetLng, coord[1] + offsetLat], // NE
          [coord[0] - offsetLng, coord[1] + offsetLat]  // NW
        );
      }
    });

    return bufferPoints;
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
        this.visibleGeofences.delete(geofenceId);

        this.updatePanelGeofenceList();

        this.showNotification(`✓ ${this.tracker.t('geofenceDeleted')}: "${geofence.name}"`, 'success');
        this.updateGeofenceLegend();
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
      // Only check violations in live mode
      if (!this.tracker.isHistoryMode) {
        this.checkGeofenceViolation(location);
      }
    };
  }

  async checkGeofenceViolation(location) {
    try {
      const response = await fetch(
        `${this.tracker.config.apiBaseUrl}/api/geofence/check?lat=${location.latitude}&lng=${location.longitude}`
      );

      if (response.ok) {
        const result = await response.json();
        const applicableGeofences = result.geofences.filter(gf => {
          // If no device linked, it applies to all. If linked, must match.
          return !gf.linked_device_id || gf.linked_device_id === location.device_id;
        });
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

  // Check geofences for historical data
  async checkHistoricalLocationsAgainstGeofences() {
    if (!this.tracker.isHistoryMode || this.tracker.filteredLocations.length === 0) {
      return;
    }

    // Clear previous state
    this.devicesInsideGeofences.clear();

    // Check each location
    for (const location of this.tracker.filteredLocations) {
      try {
        const response = await fetch(
          `${this.tracker.config.apiBaseUrl}/api/geofence/check?lat=${location.latitude}&lng=${location.longitude}`
        );

        if (response.ok) {
          const result = await response.json();
          if (result.count > 0) {
            const currentGeofences = new Set(result.geofences.map(gf => gf.id));
            this.devicesInsideGeofences.set(location.device_id, currentGeofences);
          }
        }
      } catch (error) {
        console.error('Error checking historical location:', error);
      }
    }

    this.updateGeofenceStats();
    this.updateGeofenceLegend();
  }

  checkAllDeviceLocations() {
    // Check all current device locations against geofences
    const locationsToCheck = this.tracker.isHistoryMode
      ? this.tracker.filteredLocations
      : this.tracker.locations;

    if (!this.tracker.isHistoryMode) {
      locationsToCheck.forEach(location => {
        this.checkGeofenceViolation(location);
      });
    } else {
      this.checkHistoricalLocationsAgainstGeofences();
    }
  }

async handleViolationEvent(location, eventType, geofences) {
  const geofenceNames = geofences.map(gf => gf.name).join(', ');

  const message = eventType === 'entered'
    ? `🚨 ${location.device_id} ${this.tracker.t('deviceEntered')}: ${geofenceNames}`
    : `🚨 ${location.device_id} ${this.tracker.t('deviceExited')}: ${geofenceNames}`;

  this.showNotification(message, eventType === 'entered' ? 'warning' : 'info', 5000);

  // ✅ NEW: Save notification to database
  try {
    await fetch(`${this.tracker.config.apiBaseUrl}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: location.device_id,
        message: message,
        type: eventType === 'entered' ? 'alert' : 'info',
        latitude: location.latitude,
        longitude: location.longitude
      })
    });

    // Reload notifications in UI
    if (this.tracker.notificationManager) {
      this.tracker. notificationManager.loadNotifications();
    }
  } catch (error) {
    console.error('Failed to save notification:', error);
  }

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

    // Also update panel list
    this.updatePanelGeofenceList();
  }

  updatePanelGeofenceList() {
    const container = document.getElementById('geofence-panel-items');
    if (!container) return;

    // Update stats
    const totalElement = document.getElementById('panel-total-geofences-count');
    if (totalElement) {
      totalElement.textContent = this.geofences.size;
    }

    const activeCount = Array.from(this.geofences.values()).filter(gf => gf.active).length;
    const activeElement = document.getElementById('panel-active-geofences-count');
    if (activeElement) {
      activeElement.textContent = activeCount;
    }

    const devicesInsideCount = this.devicesInsideGeofences.size;
    const devicesElement = document.getElementById('panel-devices-inside-count');
    if (devicesElement) {
      devicesElement.textContent = devicesInsideCount;
    }

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
      const color = gf.active ? '#667eea' : '#9ca3af';
      const isVisible = this.visibleGeofences.has(gf.id);

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
              ${gf.active ? '✔' : '✗'}
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
