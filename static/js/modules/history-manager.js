import { formatDateTimeLocal } from '../utils/helpers.js';
import { Validator } from '../utils/validators.js';

export class HistoryManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.timeFilter = null;
    this.locationFilter = null;
    this.activeFilterType = null;
    this.persistedTimeFilter = null;
    this.persistedLocationFilter = null;
    this.lastActiveConfigTab = 'time-filter';
  }

  // New method: Open history config popup (replaces toggle behavior)
  openHistoryConfig() {
    const popup = document.getElementById('history-config-popup');
    if (popup) {
      popup.classList.add('active');
      
      // Restore persisted filters if they exist
      if (this.persistedTimeFilter) {
        document.getElementById('start-time-popup').value = formatDateTimeLocal(this.persistedTimeFilter.start);
        document.getElementById('end-time-popup').value = formatDateTimeLocal(this.persistedTimeFilter.end);
      } else if (this.persistedLocationFilter) {
        document.getElementById('location-lat-input').value = this.persistedLocationFilter.lat;
        document.getElementById('location-lng-input').value = this.persistedLocationFilter.lng;
        document.getElementById('location-radius-input').value = this.persistedLocationFilter.radius;
      }
    }
  }

  // Activate history mode (called when filter is applied)
  activateHistoryMode() {
    if (this.tracker.isHistoryMode) return; // Already in history mode

    this.tracker.isHistoryMode = true;
    const historyBtn = document.getElementById('history-mode-btn');
    const liveModeBtn = document.getElementById('live-mode-btn');
    const trackBtn = document.getElementById('track-latest-btn');
    const modeIndicator = document.getElementById('mode-indicator');

    // Update UI
    modeIndicator.className = 'mode-indicator history-mode';
    modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('historyModeBadge')}</span>`;

    historyBtn.style.display = 'none';
    liveModeBtn.style.display = 'flex';
    trackBtn.style.display = 'none';

    this.tracker.toggleTracking(false);
    this.tracker.mapManager.clearSelectedLocationMarker();
    this.tracker.selectedLocationIndex = -1;

    // Clear live mode visualizations
    this.tracker.mapManager.clearAllMarkers();
    this.tracker.mapManager.clearTraceMarkers();
    this.tracker.mapManager.clearAllRoutes();
    this.tracker.routeCoords = [];
    this.tracker.mapManager.updateRouteLine();

    this.tracker.updateRefreshButtonState();
    this.tracker.updateUILanguage();
  }

  // Deactivate history mode (return to live mode)
  deactivateHistoryMode() {
    if (!this.tracker.isHistoryMode) return; // Already in live mode

    this.tracker.isHistoryMode = false;
    const historyBtn = document.getElementById('history-mode-btn');
    const liveModeBtn = document.getElementById('live-mode-btn');
    const trackBtn = document.getElementById('track-latest-btn');
    const modeIndicator = document.getElementById('mode-indicator');

    // Persist current filters
    if (this.timeFilter && this.activeFilterType === 'time') {
      this.persistedTimeFilter = {...this.timeFilter};
      this.persistedLocationFilter = null;
    } else if (this.locationFilter && this.activeFilterType === 'location') {
      this.persistedLocationFilter = {...this.locationFilter};
      this.persistedTimeFilter = null;
    }

    // Update UI
    modeIndicator.className = 'mode-indicator live-mode';
    modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('liveModeBadge')}</span>`;

    historyBtn.style.display = 'flex';
    liveModeBtn.style.display = 'none';
    trackBtn.style.display = 'flex';

    // Clear history mode visualizations
    this.tracker.mapManager.clearAllMarkers();
    this.tracker.mapManager.clearTraceMarkers();
    this.tracker.mapManager.clearAllRoutes();
    this.tracker.filteredLocations = [];
    this.tracker.updateTimeFilterIndicator();

    // Load live data
    this.tracker.loadInitialData();

    // Process queued live updates
    while (this.tracker.liveUpdateQueue.length > 0) {
      const queuedLocation = this.tracker.liveUpdateQueue.shift();
      this.tracker.applyLocationUpdate(queuedLocation);
    }

    this.tracker.updateRefreshButtonState();
    this.tracker.updateLocationSelection();
    this.tracker.hideNoFilterOverlay();
    this.tracker.updateUILanguage();
  }

  async loadHistoricalData() {
    if (!this.timeFilter) return;

    try {
      const startTimestamp = this.timeFilter.start.toISOString();
      const endTimestamp = this.timeFilter.end.toISOString();

      let url = `${this.tracker.config.apiBaseUrl}/api/locations/range?start=${startTimestamp}&end=${endTimestamp}`;

      const selectedDeviceIds = Array.from(this.tracker.selectedDevices);
      if (selectedDeviceIds.length > 0 && selectedDeviceIds.length < this.tracker.devices.size) {
        selectedDeviceIds.forEach(deviceId => {
          url += `&device=${encodeURIComponent(deviceId)}`;
        });
      }

      const response = await fetch(url);
      if (response.ok) {
        const locations = await response.json();
        this.tracker.filteredLocations = locations || [];

        this.tracker.mapManager.clearAllMarkers();
        this.tracker.displayFilteredLocations();
        this.tracker.updateRouteForFiltered();

        if (this.tracker.filteredLocations.length > 0) {
          this.tracker.mapManager.fitMapToLocations(this.tracker.filteredLocations);
        } else {
          setTimeout(() => this.tracker.showEmptyResultsPopup(), 500);
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load historical data:', response.status, errorText);
        this.tracker.showError('Failed to load historical data: ' + errorText);
      }
    } catch (error) {
      console.error('Error loading historical data:', error);
      this.tracker.showError('Failed to load historical data: ' + error.message);
    }
  }

  async loadHistoricalByLocation(latitude, longitude, radiusKm = 0.5) {
    console.log('loadHistoricalByLocation called with:', {latitude, longitude, radiusKm});

    try {
      let url = `${this.tracker.config.apiBaseUrl}/api/locations/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`;

      const selectedDeviceIds = Array.from(this.tracker.selectedDevices);
      if (selectedDeviceIds.length > 0 && selectedDeviceIds.length < this.tracker.devices.size) {
        selectedDeviceIds.forEach(deviceId => {
          url += `&device=${encodeURIComponent(deviceId)}`;
        });
      }

      console.log('Fetching from URL:', url);

      const response = await fetch(url);
      console.log('Response status:', response.status);

      if (response.ok) {
        const locations = await response.json();
        console.log('Received locations:', locations?.length || 0);

        this.locationFilter = {lat: latitude, lng: longitude, radius: radiusKm};
        this.activeFilterType = 'location';
        this.timeFilter = null;
        this.persistedTimeFilter = null;
        this.persistedLocationFilter = {lat: latitude, lng: longitude, radius: radiusKm};

        this.tracker.filteredLocations = locations || [];

        console.log('Filter state set:', {
          locationFilter: this.locationFilter,
          activeFilterType: this.activeFilterType,
          filteredLocationsCount: this.tracker.filteredLocations.length
        });

        document.getElementById('start-time-popup').value = '';
        document.getElementById('end-time-popup').value = '';
        document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));

        this.tracker.mapManager.clearAllMarkers();
        this.tracker.mapManager.clearTraceMarkers();
        this.tracker.routeCoords = [];
        this.tracker.mapManager.updateRouteLine();
        this.tracker.displayFilteredLocations();
        this.tracker.updateTimeFilterIndicator();
        this.tracker.hideNoFilterOverlay();

        const historyConfigPopup = document.getElementById('history-config-popup');
        if (historyConfigPopup) {
          historyConfigPopup.classList.remove('active');
        }

        if (this.tracker.filteredLocations.length > 0) {
          console.log('Has results, fitting map');
          this.tracker.mapManager.fitMapToLocations(this.tracker.filteredLocations);
          this.tracker.updateRouteForFiltered();
        } else {
          console.log('No results, showing empty results popup');
          setTimeout(() => {
            this.tracker.showEmptyResultsPopup(true, radiusKm);
          }, 300);
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load location data:', response.status, errorText);

        const historyConfigPopup = document.getElementById('history-config-popup');
        if (historyConfigPopup) {
          historyConfigPopup.classList.remove('active');
        }

        this.tracker.showError('Failed to load location data: ' + response.status);
      }
    } catch (error) {
      console.error('Error loading location data:', error);

      const historyConfigPopup = document.getElementById('history-config-popup');
      if (historyConfigPopup) {
        historyConfigPopup.classList.remove('active');
      }

      this.tracker.showError('Failed to load location data: ' + error.message);
    }
  }

  restoreTimePickerValues() {
    if (this.persistedTimeFilter) {
      document.getElementById('start-time-popup').value = formatDateTimeLocal(this.persistedTimeFilter.start);
      document.getElementById('end-time-popup').value = formatDateTimeLocal(this.persistedTimeFilter.end);
      this.tracker.updateTimeFilterIndicator();
    }
  }

  validateTimeFilter() {
    const startInput = document.getElementById('start-time-popup');
    const endInput = document.getElementById('end-time-popup');
    const errorElement = document.getElementById('validation-error');
    const applyBtn = document.getElementById('apply-time-filter-popup');

    if (!startInput || !endInput) return false;

    const result = Validator.validateTimeFilter(startInput, endInput);
    
    if (!result.isValid) {
      this.tracker.showValidationError(result.error, applyBtn, errorElement);
      return false;
    }

    this.tracker.clearValidationError(applyBtn, errorElement);
    return true;
  }

  setQuickTimeRange(hours) {
    const now = new Date();
    const endTime = new Date(now);
    const startTime = new Date(now - hours * 60 * 60 * 1000);

    document.getElementById('start-time-popup').value = formatDateTimeLocal(startTime);
    document.getElementById('end-time-popup').value = formatDateTimeLocal(endTime);
  }

  applyTimeFilterFromPopup() {
    console.log('applyTimeFilterFromPopup called');

    if (!this.validateTimeFilter()) {
      console.log('Validation failed, not applying filter');
      return;
    }

    const startTime = new Date(document.getElementById('start-time-popup').value);
    const endTime = new Date(document.getElementById('end-time-popup').value);

    console.log('Applying time filter:', {start: startTime, end: endTime});

    // Clear location filter inputs
    document.getElementById('location-lat-input').value = '';
    document.getElementById('location-lng-input').value = '';
    document.getElementById('location-radius-input').value = '0.5';

    // Set filter
    this.timeFilter = {start: startTime, end: endTime};
    this.activeFilterType = 'time';
    this.locationFilter = null;
    this.persistedLocationFilter = null;
    console.log('timeFilter set to:', this.timeFilter);

    // Activate history mode
    this.activateHistoryMode();

    this.tracker.updateTimeFilterIndicator();
    this.loadHistoricalData();
    this.tracker.hideNoFilterOverlay();

    document.getElementById('history-config-popup').classList.remove('active');
  }

  applyLocationFilterFromPopup() {
    const latInput = document.getElementById('location-lat-input');
    const lngInput = document.getElementById('location-lng-input');
    const radiusInput = document.getElementById('location-radius-input');
    const errorElement = document.getElementById('location-validation-error');
    const applyBtn = document.getElementById('apply-location-filter');

    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    const radius = parseFloat(radiusInput.value);

    const result = Validator.validateLocationFilter(lat, lng, radius);
    
    if (!result.isValid) {
      this.tracker.showValidationError(result.error, applyBtn, errorElement);
      return;
    }

    this.tracker.clearValidationError(applyBtn, errorElement);

    // Clear time filter inputs
    document.getElementById('start-time-popup').value = '';
    document.getElementById('end-time-popup').value = '';
    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));

    // Activate history mode
    this.activateHistoryMode();

    // Load data
    this.loadHistoricalByLocation(lat, lng, radius);
  }

  clearTimeFilter() {
    this.timeFilter = null;
    this.persistedTimeFilter = null;
    
    // Clear inputs
    document.getElementById('start-time-popup').value = '';
    document.getElementById('end-time-popup').value = '';
    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));

    // If this was the active filter, deactivate history mode
    if (this.activeFilterType === 'time') {
      this.activeFilterType = null;
      this.deactivateHistoryMode();
    }

    this.tracker.updateTimeFilterIndicator();
    document.getElementById('history-config-popup').classList.remove('active');
  }

  clearLocationFilter() {
    this.locationFilter = null;
    this.persistedLocationFilter = null;
    
    // Clear inputs
    document.getElementById('location-lat-input').value = '';
    document.getElementById('location-lng-input').value = '';
    document.getElementById('location-radius-input').value = '0.5';

    // If this was the active filter, deactivate history mode
    if (this.activeFilterType === 'location') {
      this.activeFilterType = null;
      this.deactivateHistoryMode();
    }

    this.tracker.updateTimeFilterIndicator();
    document.getElementById('history-config-popup').classList.remove('active');
  }
}
