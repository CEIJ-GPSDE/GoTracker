import { calculateBearing } from '../utils/helpers.js';

export class MapManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.map = null;
    this.markers = new Map();
    this.traceMarkers = [];
    this.selectedLocationMarker = null;
  }

initialize() {
  const { mapStyle, defaultCenter, defaultZoom } = this.tracker.config;

  try {
    this.map = new maplibregl.Map({
      container: 'map',
      style: mapStyle,
      center: defaultCenter,
      zoom: defaultZoom,
      attributionControl: true,
      localIdeographFontFamily: "'Arial', 'Helvetica', sans-serif"
    });

    this.map.addControl(new maplibregl.NavigationControl(), 'bottom-left');
    this.map.addControl(new maplibregl.FullscreenControl(), 'bottom-left');

    this.setupMapEvents();

    // ✅ ESPERAR a que el mapa cargue completamente
    this.map.once('load', () => {
      console.log('✅ Map loaded successfully');
      this.initializeRouteLine();

      // ✅ Notificar que el mapa está listo
      if (this.tracker.onMapReady) {
        this.tracker.onMapReady();
      }
    });

    this.map.on('error', (e) => {
      console.warn('Map warning:', e);
    });

  } catch (error) {
    console.error('❌ Failed to initialize map:', error);
  }
}

  setupMapEvents() {
    this.map.on('dragstart', () => {
      if (!this.tracker.suppressUserInteraction) this.tracker.handleUserInteraction();
    });

    this.map.on('zoomstart', () => {
      if (!this.tracker.suppressUserInteraction) this.tracker.handleUserInteraction();
    });

    this.map.on('movestart', () => {
      if (!this.tracker.suppressUserInteraction) this.tracker.handleUserInteraction();
    });
  }

  initializeRouteLine() {
    if (this.map.getSource('route')) {
      if (this.map.getLayer('route-line')) {
        this.map.removeLayer('route-line');
      }
      this.map.removeSource('route');
    }

    for (let i = 0; i < 100; i++) {
      if (this.map.getLayer(`route-segment-${i}`)) {
        this.map.removeLayer(`route-segment-${i}`);
      }
    }

    this.map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }

  updateRouteLine() {
    if (!this.map.getSource('route')) return;

    const coordinates = this.tracker.routeCoords;

    if (coordinates.length < 2) {
      for (let i = 0; i < 100; i++) {
        if (this.map.getLayer(`route-segment-${i}`)) {
          this.map.removeLayer(`route-segment-${i}`);
        }
      }
      this.map.getSource('route').setData({
        type: 'FeatureCollection',
        features: []
      });
      this.updateRouteLegend();
      return;
    }

    const features = [];
    const totalSegments = coordinates.length - 1;

    for (let i = 0; i < totalSegments; i++) {
      const progress = 1 - (i / totalSegments);
      let color;

      if (progress < 0.5) {
        const localProgress = progress * 2;
        const r = Math.round(16 + (245 - 16) * localProgress);
        const g = Math.round(185 - (185 - 158) * localProgress);
        const b = Math.round(129 - (129 - 11) * localProgress);
        color = `rgb(${r}, ${g}, ${b})`;
      } else {
        const localProgress = (progress - 0.5) * 2;
        const r = Math.round(245 + (239 - 245) * localProgress);
        const g = Math.round(158 - (158 - 68) * localProgress);
        const b = Math.round(11 + (68 - 11) * localProgress);
        color = `rgb(${r}, ${g}, ${b})`;
      }

      features.push({
        type: 'Feature',
        properties: { color, segmentIndex: i },
        geometry: {
          type: 'LineString',
          coordinates: [coordinates[i], coordinates[i + 1]]
        }
      });
    }

    for (let i = 0; i < 100; i++) {
      if (this.map.getLayer(`route-segment-${i}`)) {
        this.map.removeLayer(`route-segment-${i}`);
      }
    }

    this.map.getSource('route').setData({
      type: 'FeatureCollection',
      features: features
    });

    features.forEach((feature, index) => {
      const layerId = `route-segment-${index}`;

      if (!this.map.getLayer(layerId)) {
        this.map.addLayer({
          id: layerId,
          type: 'line',
          source: 'route',
          filter: ['==', 'segmentIndex', index],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': feature.properties.color,
            'line-width': 5,
            'line-opacity': 0.8
          }
        });
      }
    });

    this.updateRouteLegend();
  }

  updateRouteLegend() {
    const legend = document.getElementById('route-legend');
    if (!legend) return;

    if (this.tracker.routeCoords.length > 1) {
      legend.style.display = 'block';
    } else {
      legend.style.display = 'none';
    }
  }

  createTraceMarker(location, isStart = false, isEnd = false, progress = 0.5) {
    const deviceInfo = this.tracker.devices.get(location.device_id);
    const deviceColor = deviceInfo ? deviceInfo.color : '#3b82f6';

    const popupContent = `
      <div style="font-family: system-ui; min-width: 200px;">
        <h4 style="margin: 0 0 10px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${deviceColor};"></div>
          ${location.device_id}
          ${isStart ? ` <span style="color: #10b981; font-size: 12px;">(${this.tracker.t('start')})</span>` : ''}
          ${isEnd ? ` <span style="color: #ef4444; font-size: 12px;">(${this.tracker.t('end')})</span>` : ''}
        </h4>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
          <strong>${this.tracker.t('coordinates')}:</strong><br>
          ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          <strong>${this.tracker.t('time')}:</strong><br>
          ${new Date(location.timestamp).toLocaleString()}
        </div>
      </div>
    `;

    const el = document.createElement('div');
    el.className = 'trace-marker';

    if (this.tracker.showTraceDots) {
      el.classList.add('always-visible');
    }

    if (isStart) {
      el.classList.add('start-point');
      el.style.backgroundColor = deviceColor;
      el.style.borderColor = '#10b981';
    } else if (isEnd) {
      el.classList.add('end-point');
      el.style.backgroundColor = deviceColor;
      el.style.borderColor = '#ef4444';
    } else {
      el.style.backgroundColor = deviceColor;

      let haloColor;
      if (progress < 0.5) {
        const localProgress = progress * 2;
        const r = Math.round(16 + (245 - 16) * localProgress);
        const g = Math.round(185 - (185 - 158) * localProgress);
        const b = Math.round(129 - (129 - 11) * localProgress);
        haloColor = `rgb(${r}, ${g}, ${b})`;
      } else {
        const localProgress = (progress - 0.5) * 2;
        const r = Math.round(245 + (239 - 245) * localProgress);
        const g = Math.round(158 - (158 - 68) * localProgress);
        const b = Math.round(11 + (68 - 11) * localProgress);
        haloColor = `rgb(${r}, ${g}, ${b})`;
      }

      el.style.borderColor = haloColor;
    }

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([location.longitude, location.latitude])
      .setPopup(new maplibregl.Popup({
        offset: 15,
        closeButton: false
      }).setHTML(popupContent))
      .addTo(this.map);

    this.traceMarkers.push(marker);
  }

  clearTraceMarkers() {
    this.traceMarkers.forEach(m => m.remove());
    this.traceMarkers = [];
  }

  clearAllMarkers() {
    this.markers.forEach(marker => marker.remove());
    this.markers.clear();
  }

  clearAllRoutes() {
    this.tracker.devices.forEach((info, deviceId) => {
      const sourceId = `route-${deviceId}`;
      const layerId = `route-${deviceId}`;

      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    });

    if (this.map.getSource('route')) {
      for (let i = 0; i < 100; i++) {
        if (this.map.getLayer(`route-segment-${i}`)) {
          this.map.removeLayer(`route-segment-${i}`);
        }
      }
      if (this.map.getLayer('route-line')) {
        this.map.removeLayer('route-line');
      }
      this.map.removeSource('route');
    }
  }

  updateMapMarker(location, isLatest = false) {
    const deviceId = location.device_id;
    let marker = this.markers.get(deviceId);
    const deviceColor = this.tracker.getDeviceColor(deviceId);
    const deviceInfo = this.tracker.devices.get(deviceId);

    const popupContent = `
      <div style="font-family: system-ui; min-width: 200px;">
        <h4 style="margin: 0 0 10px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${deviceColor};"></div>
          ${deviceId}
        </h4>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
          <strong>${this.tracker.t('coordinates')}:</strong><br>
          ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          <strong>${this.tracker.t('time')}:</strong><br>
          ${new Date(location.timestamp).toLocaleString()}
        </div>
      </div>
    `;

    if (!marker) {
      let el;
      if (isLatest) {
        el = document.createElement('div');
        el.className = 'pulse-marker';
        el.style.backgroundColor = deviceColor;
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
      }

      marker = new maplibregl.Marker({
        element: el || undefined,
        color: isLatest ? undefined : deviceColor,
        anchor: 'center'
      })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent))
        .addTo(this.map);

      this.markers.set(deviceId, marker);

      if (deviceInfo && !deviceInfo.visible) {
        marker.getElement().style.display = 'none';
      }
    } else {
      marker.setLngLat([location.longitude, location.latitude]);
      marker.setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent));

      const el = marker.getElement();
      if (isLatest && !el.classList.contains('pulse-marker')) {
        el.className = 'pulse-marker';
        el.style.backgroundColor = deviceColor;
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
      } else if (isLatest) {
        el.style.backgroundColor = deviceColor;
      }
    }
  }

  // NEW METHOD: Update markers for all selected devices with their latest locations
  updateAllDeviceMarkers() {
    // Get the latest location for each selected device
    const latestByDevice = new Map();

    this.tracker.locations.forEach(loc => {
      if (this.tracker.selectedDevices.has(loc.device_id)) {
        if (!latestByDevice.has(loc.device_id)) {
          latestByDevice.set(loc.device_id, loc);
        }
      }
    });

    // Update marker for each device
    latestByDevice.forEach((location, deviceId) => {
      this.updateMapMarker(location, true);
    });

    console.log(`Updated markers for ${latestByDevice.size} devices`);
  }

  centerMapOnLocation(location) {
    this.tracker.userInteracted = false;
    this.tracker.suppressUserInteraction = true;

    this.map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(this.map.getZoom(), 12),
      duration: 800
    });

    this.map.once('moveend', () => {
      setTimeout(() => { this.tracker.suppressUserInteraction = false; }, 50);
    });
  }

  centerMapOnDevices() {
    const latestByDevice = new Map();

    this.tracker.locations.forEach(loc => {
      if (this.tracker.selectedDevices.has(loc.device_id) && !latestByDevice.has(loc.device_id)) {
        latestByDevice.set(loc.device_id, loc);
      }
    });

    if (latestByDevice.size === 0) return;

    if (latestByDevice.size === 1) {
      this.centerMapOnLocation(Array.from(latestByDevice.values())[0]);
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    latestByDevice.forEach(loc => {
      bounds.extend([loc.longitude, loc.latitude]);
    });

    this.tracker.suppressUserInteraction = true;
    this.map.fitBounds(bounds, {
      padding: 100,
      maxZoom: 15,
      duration: 800
    });

    this.map.once('moveend', () => {
      setTimeout(() => { this.tracker.suppressUserInteraction = false; }, 50);
    });
  }

  centerOnSelectedDevices() {
    // Get only visible/selected devices
    const visibleDevices = Array.from(this.tracker.selectedDevices).filter(deviceId => {
      const deviceInfo = this.tracker.devices.get(deviceId);
      return deviceInfo && deviceInfo.visible;
    });

    if (visibleDevices.length === 0) {
      console.log('No visible devices to center on');
      this.showNotification(this.tracker.t('noDevicesFound'), 'info');
      return;
    }

    let locationsToConsider;

    // Get locations based on current mode
    if (this.tracker.isHistoryMode) {
      locationsToConsider = this.tracker.filteredLocations.filter(loc =>
        visibleDevices.includes(loc.device_id)
      );
    } else {
      locationsToConsider = this.tracker.locations.filter(loc =>
        visibleDevices.includes(loc.device_id)
      );
    }

    if (locationsToConsider.length === 0) {
      console.log('No locations found for visible devices');
      this.showNotification(this.tracker.t('noLocationsFound'), 'info');
      return;
    }

    // If only one location, just center on it
    if (locationsToConsider.length === 1) {
      this.centerMapOnLocation(locationsToConsider[0]);
      return;
    }

    // Multiple locations - fit bounds to show all
    const bounds = new maplibregl.LngLatBounds();
    locationsToConsider.forEach(loc => {
      bounds.extend([loc.longitude, loc.latitude]);
    });

    this.tracker.suppressUserInteraction = true;
    this.map.fitBounds(bounds, {
      padding: 100,
      maxZoom: 15,
      duration: 800
    });

    this.map.once('moveend', () => {
      setTimeout(() => { this.tracker.suppressUserInteraction = false; }, 50);
    });

    console.log(`Centered map on ${locationsToConsider.length} locations from ${visibleDevices.length} devices`);
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `map-notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
      animation: slideInRight 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  fitMapToLocations(locations) {
    if (locations.length === 0) return;

    if (locations.length === 1) {
      this.centerMapOnLocation(locations[0]);
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    locations.forEach(loc => {
      bounds.extend([loc.longitude, loc.latitude]);
    });

    this.map.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15
    });
  }

  showSelectedLocationMarker(location) {
    this.clearSelectedLocationMarker();

    const popupContent = `
        <div style="font-family: system-ui; min-width: 200px;">
            <h4 style="margin: 0 0 10px 0; color: #374151;">${location.device_id} <span style="color: #f59e0b; font-size: 12px;">(${this.tracker.t('selected')})</span></h4>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                <strong>${this.tracker.t('coordinates')}:</strong><br>
                ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
                <strong>${this.tracker.t('time')}:</strong><br>
                ${new Date(location.timestamp).toLocaleString()}
            </div>
            <button onclick="window.locationTracker.clearSelectedLocation()" style="margin-top: 10px; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                ${this.tracker.t('clearSelection')}
            </button>
        </div>
    `;

    const el = document.createElement('div');
    el.className = 'selected-location-marker';
    el.style.cssText = `
        width: 20px;
        height: 20px;
        background: #f59e0b;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
        cursor: pointer;
        z-index: 1002;
    `;

    this.selectedLocationMarker = new maplibregl.Marker({ element: el })
      .setLngLat([location.longitude, location.latitude])
      .setPopup(new maplibregl.Popup().setHTML(popupContent))
      .addTo(this.map);

    this.selectedLocationMarker.togglePopup();
  }

  clearSelectedLocationMarker() {
    if (this.selectedLocationMarker) {
      this.selectedLocationMarker.remove();
      this.selectedLocationMarker = null;
    }
  }

  centerMapOnLatestLocation() {
    if (this.tracker.locations.length > 0) {
      this.centerMapOnLocation(this.tracker.locations[0]);
    }
  }
}
