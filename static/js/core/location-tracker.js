// static/js/core/location-tracker.js - UPDATED VERSION
import { CONFIG, getApiConfig } from './config.js';
import { TranslationManager } from './translations.js';
import { MapManager } from '../modules/map-manager.js';
import { WebSocketManager } from '../modules/websocket-manager.js';
import { HistoryManager } from '../modules/history-manager.js';
import { DeviceManager } from '../modules/device-manager.js';
import { UIManager } from '../modules/ui-manager.js';
import { GeofenceManager } from '../modules/geofence-manager.js';
import { ClusteringManager } from '../modules/clustering-manager.js';
import { RouteManager } from '../modules/route-manager.js';
import { VehiclePanelManager } from '../modules/vehicle-panel-manager.js';

export class LocationTracker {
  constructor() {
    // Core state
    this.config = { ...CONFIG, ...getApiConfig() };
    this.translationManager = new TranslationManager();
    
    // Initialize managers
    this.mapManager = new MapManager(this);
    this.wsManager = new WebSocketManager(this);
    this.historyManager = new HistoryManager(this);
    this.deviceManager = new DeviceManager(this);
    this.uiManager = new UIManager(this);
    this.geofenceManager = null; // Initialized after map loads
    this.clusteringManager = null; // Initialized after map loads
    this.routeManager = null; // Initialized after map loads
    this.vehiclePanelManager = null; // Initialized after map loads
    this.useMarkerClustering = false; // Toggle for clustering
    this.slidingPanelOpen = false; // Panel starts closed
    this.activePanelTab = 'vehicles'; // Default tab

    // State variables
    this.locations = [];
    this.filteredLocations = [];
    this.liveLocations = [];
    this.routeCoords = [];
    this.liveUpdateQueue = [];
    
    // Flags and settings
    this.isTrackingLatest = true;
    this.isHistoryMode = false;
    this.showTraceDots = true;
    this.userInteracted = false;
    this.suppressUserInteraction = false;
    this.isSelectingLocationOnMap = false;
    this.mapSelectionHandler = null;
    this.deviceLegendCollapsed = false;
    this.useMarkerClustering = false; // Toggle for clustering
    
    // Selection state
    this.selectedLocationIndex = -1;
    
    // History mode limits
    this.historyLimit = CONFIG.historyLimit;
    this.maxReconnectAttempts = CONFIG.maxReconnectAttempts;
    this.deviceColors = CONFIG.deviceColors;

    // Live update tracking
    this.hasReceivedLiveUpdate = false;
    this.initialDbLocation = null;

    this.initializeApp();
  }

  // Proxy methods for translation manager
  t(key) { return this.translationManager.t(key); }
  setLanguage(lang) { 
    if (this.translationManager.setLanguage(lang)) {
      this.updateUILanguage();
    }
  }

  // Proxy methods for easier access to managers
  get devices() { return this.deviceManager.devices; }
  get selectedDevices() { return this.deviceManager.selectedDevices; }
  get timeFilter() { return this.historyManager.timeFilter; }
  set timeFilter(value) { this.historyManager.timeFilter = value; }
  get locationFilter() { return this.historyManager.locationFilter; }
  set locationFilter(value) { this.historyManager.locationFilter = value; }
  get activeFilterType() { return this.historyManager.activeFilterType; }
  set activeFilterType(value) { this.historyManager.activeFilterType = value; }
  get ws() { return this.wsManager.ws; }

  async initializeApp() {
    try {
      this.mapManager.initialize();
      
      // Initialize geofence and clustering managers after map loads
      this.mapManager.map.on('load', () => {
        this.geofenceManager = new GeofenceManager(this);
        this.geofenceManager.initialize();
        
        this.clusteringManager = new ClusteringManager(this.mapManager);
        this.clusteringManager.initialize();
        
        // AGREGAR ESTAS LÍNEAS:
        this.vehiclePanelManager = new VehiclePanelManager(this);
        this.vehiclePanelManager.initialize();
        
        this.routeManager = new RouteManager(this);
        this.routeManager.initialize();
        // Setup map event handlers for geofence drawing
        this.mapManager.map.on('click', (e) => {
          this.geofenceManager.handleMapClick(e);
        });
        
        this.mapManager.map.on('dblclick', (e) => {
          this.geofenceManager.handleMapDoubleClick(e);
        });
        
        // Setup keyboard handler for finishing drawing
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && this.geofenceManager.drawingMode) {
            this.geofenceManager.finishDrawing();
          } else if (e.key === 'Escape' && this.geofenceManager.drawingMode) {
            this.geofenceManager.cancelDrawing();
          }
        });
      });
      
      this.uiManager.setupEventListeners();
      this.uiManager.setupPopupMenu();
      this.uiManager.setupOverlayEventListeners();
      await this.deviceManager.loadDevices();
      await this.loadInitialData();
      
      this.setupVisibilityHandler();
      
      this.wsManager.connect();
      this.startStatsPolling();
      this.uiManager.initializeTimePickers();
      this.uiManager.updateRefreshButtonState();
      this.updateTimeFilterIndicator();
      this.uiManager.updateUILanguage();
      document.getElementById('language-selector').value = this.translationManager.currentLanguage;
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Failed to initialize application');
    }
  }

  handleUserInteraction() {
    if (this.suppressUserInteraction) return;

    if (!this.userInteracted) {
      this.userInteracted = true;
      if (this.isTrackingLatest) {
        this.toggleTracking(false);
      }
    }
  }

  toggleTracking(enable = null) {
    if (enable === null) {
      this.isTrackingLatest = !this.isTrackingLatest;
    } else {
      this.isTrackingLatest = enable;
    }

    const btn = document.getElementById('track-latest-btn');
    if (this.isTrackingLatest) {
      btn.classList.add('enabled');
      btn.classList.remove('disabled');
      btn.querySelector('span:last-child').textContent = this.t('trackLatest');
      this.mapManager.centerMapOnDevices();
    } else {
      btn.classList.remove('enabled');
      btn.classList.add('disabled');
      btn.querySelector('span:last-child').textContent = this.t('trackingOff');
    }
  }

  centerOnSelectedDevices() {
    this.mapManager.centerOnSelectedDevices();
  }

  async loadInitialData() {
    try {
      const limit = this.isHistoryMode ? this.historyLimit : 1;
      const response = await fetch(`${this.config.apiBaseUrl}/api/locations/history?limit=${limit}`);
      if (response.ok) {
        const locations = await response.json();

        if (this.isHistoryMode) {
          this.locations = locations || [];
        } else {
          this.initialDbLocation = locations.length > 0 ? locations[0] : null;
          this.liveLocations = [];
          this.hasReceivedLiveUpdate = false;
          this.locations = this.initialDbLocation ? [this.initialDbLocation] : [];
        }

        this.displayLocations();
        this.updateStatistics();
        this.updateRouteForDevice();

        if (this.locations.length > 0) {
          // Check if we should use clustering
          if (this.clusteringManager && this.clusteringManager.shouldUseClustering(this.locations.length)) {
            this.enableClustering();
          } else {
            this.mapManager.updateMapMarker(this.locations[0], true);
            if (this.isTrackingLatest) {
              this.mapManager.centerMapOnLatestLocation();
            }
          }
        }
      } else {
        console.error('Failed to load initial data:', response.status);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showError('Failed to load initial data');
    }
  }

  enableClustering() {
    this.useMarkerClustering = true;
    this.mapManager.clearAllMarkers();
    
    if (this.clusteringManager) {
      this.clusteringManager.toggleClustering(true);
      this.clusteringManager.updateClusteredLocations(this.locations, this.devices);
    }
    
    console.log('Clustering enabled for', this.locations.length, 'locations');
  }

  disableClustering() {
    this.useMarkerClustering = false;
    
    if (this.clusteringManager) {
      this.clusteringManager.toggleClustering(false);
    }
    
    // Restore individual markers
    this.locations.forEach(loc => {
      this.mapManager.updateMapMarker(loc, false);
    });
    
    console.log('Clustering disabled');
  }

  handleLocationUpdate(location) {
    console.log('Received location update:', location);

    if (this.isHistoryMode) {
      this.liveUpdateQueue.push(location);
      return;
    }
    this.applyLocationUpdate(location);
    
    if (this.vehiclePanelManager) {
      this.vehiclePanelManager.updateVehiclePanel();
    }
  }

  applyLocationUpdate(location) {
    if (!this.hasReceivedLiveUpdate) {
      this.hasReceivedLiveUpdate = true;
      this.locations = [];
      this.mapManager.clearAllMarkers();
      this.mapManager.clearTraceMarkers();
    }

    this.liveLocations.unshift(location);

    if (this.liveLocations.length > this.historyLimit) {
      this.liveLocations = this.liveLocations.slice(0, this.historyLimit);
    }

    this.locations = [...this.liveLocations];

    const deviceInfo = this.devices.get(location.device_id);
    if (deviceInfo) {
      deviceInfo.count++;
    } else {
      this.deviceManager.getDeviceColor(location.device_id);
      this.selectedDevices.add(location.device_id);
    }

    this.deviceManager.updateDeviceLegend();
    
    // Update clustering if enabled
    if (this.useMarkerClustering && this.clusteringManager) {
      this.clusteringManager.updateClusteredLocations(this.locations, this.devices);
    }
    
    this.filterAndDisplayLocations();
    this.updateStatistics();

    if (this.selectedDevices.has(location.device_id)) {
      if (!this.useMarkerClustering) {
        this.mapManager.updateMapMarker(location, !this.isHistoryMode);
      }
      this.deviceManager.updateDeviceRoute(location.device_id);

      if (this.isTrackingLatest && !this.userInteracted) {
        if (this.selectedDevices.size === 1) {
          this.mapManager.centerMapOnLocation(location);
        } else {
          this.mapManager.centerMapOnDevices();
        }
      }
    }
  }

  // Route methods
  updateRouteForDevice() {
    this.mapManager.clearTraceMarkers();

    const visibleLocations = this.locations.filter(loc =>
      this.selectedDevices.has(loc.device_id)
    );

    if (this.isHistoryMode) {
      visibleLocations.forEach((loc, index) => {
        const isStart = index === visibleLocations.length - 1;
        const isEnd = index === 0;
        this.mapManager.createTraceMarker(loc, isStart, isEnd);
      });
    } else {
      visibleLocations.forEach((loc, index) => {
        const isStart = index === visibleLocations.length - 1;
        this.mapManager.createTraceMarker(loc, isStart, false);
      });
    }

    this.applyTraceDotsVisibility();
    this.mapManager.updateRouteLegend();
  }

  updateRouteForFiltered() {
    if (!this.isHistoryMode || this.filteredLocations.length === 0) {
      this.routeCoords = [];
      this.mapManager.updateRouteLine();
      this.mapManager.clearTraceMarkers();
      return;
    }

    const locationsByDevice = new Map();
    this.filteredLocations.forEach(loc => {
      if (!locationsByDevice.has(loc.device_id)) {
        locationsByDevice.set(loc.device_id, []);
      }
      locationsByDevice.get(loc.device_id).push(loc);
    });

    this.mapManager.clearTraceMarkers();

    locationsByDevice.forEach((deviceLocs, deviceId) => {
      if (deviceLocs.length < 1) return;

      const deviceInfo = this.devices.get(deviceId);
      if (!deviceInfo || !deviceInfo.visible) return;

      const coordinates = deviceLocs.map(loc => [loc.longitude, loc.latitude]);
      const sourceId = `route-${deviceId}`;
      const layerId = `route-${deviceId}`;

      if (this.mapManager.map.getSource(sourceId)) {
        this.mapManager.map.getSource(sourceId).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        });
      } else {
        this.mapManager.map.addSource(sourceId, {
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

        this.mapManager.map.addLayer({
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

      deviceLocs.forEach((loc, index) => {
        const progress = 1 - (index / (deviceLocs.length - 1));
        const isStart = index === deviceLocs.length - 1;
        const isEnd = index === 0;
        this.mapManager.createTraceMarker(loc, isStart, isEnd, progress);
      });
    });

    this.applyTraceDotsVisibility();
    this.mapManager.updateRouteLegend();
  }

  applyTraceDotsVisibility() {
    this.mapManager.traceMarkers.forEach(marker => {
      const el = marker.getElement();
      if (this.showTraceDots) {
        el.classList.add('always-visible');
      } else {
        el.classList.remove('always-visible');
      }
    });

    document.getElementById('toggle-trace-dots').checked = this.showTraceDots;
  }

  // Location selection methods
  selectLocation(locationIndex) {
    this.selectedLocationIndex = locationIndex;
    this.userInteracted = false;

    if (locationIndex >= 0) {
      this.toggleTracking(false);
      const locations = this.isHistoryMode ? this.filteredLocations : this.getFilteredLocations();
      const location = locations[locationIndex];
      if (location) {
        this.mapManager.centerMapOnLocation(location);
        this.mapManager.showSelectedLocationMarker(location);
      }
    } else {
      this.mapManager.clearSelectedLocationMarker();
    }

    this.updateLocationSelection();
  }

  clearSelectedLocation() {
    this.selectedLocationIndex = -1;
    this.mapManager.clearSelectedLocationMarker();
    this.updateLocationSelection();
    if (!this.userInteracted) {
      this.toggleTracking(true);
    }
  }

  // Display methods
  getFilteredLocations() {
    return this.locations.filter(loc =>
      this.selectedDevices.has(loc.device_id)
    );
  }

  filterAndDisplayLocations() {
    const filteredLocations = this.locations.filter(loc =>
      this.selectedDevices.has(loc.device_id)
    );
    this.displayLocations(filteredLocations);
  }

  displayLocations(locations = this.locations) {
    const container = document.getElementById('location-list');

    if (locations.length === 0) {
      container.innerHTML = `<div class="loading">${this.t('noLocationsFound')}</div>`;
      return;
    }

    container.innerHTML = locations.slice(0, this.historyLimit).map((location, index) => {
      const deviceInfo = this.devices.get(location.device_id);
      const color = deviceInfo ? deviceInfo.color : '#6b7280';

      return `
        <div class="location-item ${index === 0 ? 'latest' : ''} ${index === this.selectedLocationIndex ? 'selected' : ''}" 
            onclick="window.locationTracker.selectLocation(${index})">
          <div class="device-id">
            <div class="device-color-dot" style="background-color: ${color}"></div>
            ${location.device_id}
          </div>
          <div class="coordinates">${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</div>
          <div class="timestamp">${new Date(location.timestamp).toLocaleString()}</div>
        </div>
      `;
    }).join('');
  }

  displayFilteredLocations() {
    const container = document.getElementById('location-list');

    console.log('displayFilteredLocations called with', this.filteredLocations.length, 'locations');

    if (this.filteredLocations.length === 0) {
      container.innerHTML = `<div class="loading">${this.t('noLocationsFound')}</div>`;
      return;
    }

    container.innerHTML = this.filteredLocations.map((location, index) => `
          <div class="location-item ${index === this.selectedLocationIndex ? 'selected' : ''}" 
                onclick="window.locationTracker.selectLocation(${index})">
              <div class="device-id">${location.device_id}</div>
              <div class="coordinates">${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</div>
              <div class="timestamp">${new Date(location.timestamp).toLocaleString()}</div>
          </div>
      `).join('');
  }

  updateLocationSelection() {
    const locationItems = document.querySelectorAll('.location-item');
    locationItems.forEach((item, index) => {
      item.classList.remove('selected');
      if (index === this.selectedLocationIndex) {
        item.classList.add('selected');
      }
    });
  }

  // Statistics and status methods
  updateStatistics() {
    document.getElementById('total-locations').textContent = this.locations.length;
    document.getElementById('active-devices').textContent = this.devices.size;
    document.getElementById('last-update').textContent =
      this.locations.length > 0 ? new Date(this.locations[0].timestamp).toLocaleString() : '-';
  }

  updateConnectionStatus(message, status) {
    const statusElement = document.getElementById('connection-status');
    statusElement.className = `status ${status}`;

    const translations = {
      'Connected': this.t('connected'),
      'Connecting...': this.t('connecting'),
      'Disconnected': this.t('disconnected'),
      'Connection Error': this.t('connectionError'),
      'Connection failed - refresh page': this.t('connectionFailed')
    };

    let translatedMessage = message;
    if (translations[message]) {
      translatedMessage = translations[message];
    } else if (message.includes('Reconnecting in')) {
      const match = message.match(/Reconnecting in (\d+)s\.\.\. \((\d+)\/(\d+)\)/);
      if (match) {
        translatedMessage = this.t('reconnecting')
          .replace('{0}', match[1])
          .replace('{1}', match[2])
          .replace('{2}', match[3]);
      }
    }

    statusElement.querySelector('span').textContent = translatedMessage;
  }

  updateTimeFilterIndicator() {
    const indicator = document.getElementById('time-filter-indicator');
    const textElement = document.getElementById('time-filter-text');

    if (this.isHistoryMode) {
      indicator.classList.remove('time-filter-active', 'location-filter-active');

      if (this.activeFilterType === 'time' && this.timeFilter) {
        const startStr = this.timeFilter.start.toLocaleDateString() + ' ' +
          this.timeFilter.start.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        const endStr = this.timeFilter.end.toLocaleDateString() + ' ' +
          this.timeFilter.end.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        textElement.innerHTML = `<div><strong>${this.t('timeFilterActive')}</strong> ${startStr}</div><div>${this.t('to')} ${endStr}</div>`;
        indicator.classList.add('time-filter-active');
        indicator.classList.add('show');
      } else if (this.activeFilterType === 'location' && this.locationFilter) {
        textElement.innerHTML = `<div><strong>${this.t('locationFilterActive')}</strong></div><div>${this.t('latitude')}: ${this.locationFilter.lat.toFixed(6)}, ${this.t('longitude')}: ${this.locationFilter.lng.toFixed(6)}</div><div>${this.t('radiusLabel')} ${this.locationFilter.radius} ${this.t('km')}</div>`;
        indicator.classList.add('location-filter-active');
        indicator.classList.add('show');
      } else {
        indicator.classList.remove('show');
      }
    } else {
      indicator.classList.remove('show');
    }
  }

  // Overlay methods
  showNoFilterOverlay() {
    console.log('showNoFilterOverlay called');
    const overlay = document.getElementById('no-filter-overlay');
    if (overlay) {
      console.log('Overlay found, adding show class');
      overlay.style.display = 'none';
      overlay.offsetHeight;
      overlay.style.display = 'block';

      requestAnimationFrame(() => {
        overlay.classList.add('show');
      });
    } else {
      console.error('no-filter-overlay element not found!');
    }
  }

  hideNoFilterOverlay() {
    console.log('hideNoFilterOverlay called');
    const overlay = document.getElementById('no-filter-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
  }

  hideNoResultsOverlay() {
    console.log('hideNoResultsOverlay called');
    const overlay = document.getElementById('no-results-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
  }

  showEmptyResultsPopup(isLocationFilter = false, radius = 0) {
    console.log('showEmptyResultsPopup called with:', {isLocationFilter, radius});

    const emptyPopup = document.getElementById('no-results-overlay');
    if (!emptyPopup) {
      console.error('Empty results popup not found!');
      return;
    }

    const message = emptyPopup.querySelector('p');
    if (message) {
      if (isLocationFilter) {
        const translatedMessage = this.t('noLocationResultsMessage') ||
          `No location data found within ${radius} km of the selected coordinates.`;
        message.textContent = translatedMessage.replace('{radius}', radius);
      } else {
        message.textContent = this.t('noResultsMessage');
      }
    }

    emptyPopup.style.display = 'block';
    emptyPopup.classList.add('show');

    console.log('Empty results popup should now be visible');
  }

  // Utility methods
  showError(message) {
    const container = document.getElementById('location-list');
    container.innerHTML = `<div class="error">${message}</div>`;
  }

  async refreshData() {
    try {
      if (this.isHistoryMode && this.timeFilter) {
        await this.historyManager.loadHistoricalData();
      } else {
        this.liveLocations = [];
        this.hasReceivedLiveUpdate = false;
        await this.loadInitialData();
      }
      console.log('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      this.showError('Failed to refresh data');
    }
  }

  startStatsPolling() {
    const fetchAndUpdate = async () => {
      try {
        const res = await fetch(`${this.config.apiBaseUrl}/api/stats`);
        if (!res.ok) return;
        const stats = await res.json();
        document.getElementById('connected-clients').textContent = stats.connected_clients ?? '-';
        document.getElementById('total-locations').textContent = stats.total_locations ?? '-';
        document.getElementById('active-devices').textContent = stats.active_devices ?? '-';
        document.getElementById('last-update').textContent = stats.last_update ? new Date(stats.last_update).toLocaleString() : '-';
      } catch (err) {
        // ignore transient errors
      }
    };

    fetchAndUpdate();
    setInterval(fetchAndUpdate, 5000);
  }
  
  setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.wsManager.isConnected()) {
        console.log('Page became visible, reconnecting WebSocket...');
        this.wsManager.resetIntentionalClose();
        this.wsManager.connect();
      }
    });

    window.addEventListener('focus', () => {
      if (!this.wsManager.isConnected()) {
        console.log('Window focused, reconnecting WebSocket...');
        this.wsManager.resetIntentionalClose();
        this.wsManager.connect();
      }
    });

    window.addEventListener('beforeunload', () => {
      this.wsManager.disconnect();
    });
  }
  // Proxy method for vehicle panel
  toggleVehiclePanel() {
    if (this.vehiclePanelManager) {
      this.vehiclePanelManager.toggleVehiclePanel();
    }
  }

  toggleSlidingPanel() {
    this.slidingPanelOpen = !this.slidingPanelOpen;
    const panel = document.getElementById('sliding-panel');
    
    if (this.slidingPanelOpen) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
  }
  
  switchPanelTab(tabName) {
    this.activePanelTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.panel-tab').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.panelTab === tabName) {
        btn.classList.add('active');
      }
    });
    
    // Update tab content
    document.querySelectorAll('.panel-tab-content').forEach(content => {
      content.classList.remove('active');
      if (content.id === `${tabName}-panel-tab`) {
        content.classList.add('active');
      }
    });
  }

  // Proxy methods for UI manager
  updateUILanguage() { this.uiManager.updateUILanguage(); }
  updateRefreshButtonState() { this.uiManager.updateRefreshButtonState(); }
  showValidationError(message, button, errorElement) { this.uiManager.showValidationError(message, button, errorElement); }
  clearValidationError(button, errorElement) { this.uiManager.clearValidationError(button, errorElement); }

  // Device color helper
  getDeviceColor(deviceId) {
    return this.deviceManager.getDeviceColor(deviceId);
  }

  // Route visibility
  updateRoutesVisibility() {
    this.deviceManager.updateRoutesVisibility();
  }
}
