import { formatDateTimeLocal } from '../utils/helpers.js';
import { Validator } from '../utils/validators.js';

export class HistoryManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.timeFilter = null;
    this.locationFilter = null;
    this.timeFilterEnabled = false;
    this.locationFilterEnabled = false;
    this.timeFilterLocked = false;
    this.locationFilterLocked = false;
  }

  openHistoryConfig() {
    const popup = document.getElementById('history-config-popup');
    if (popup) {
      popup.classList.add('active');
      this.restoreFilterState();
    }
  }

  restoreFilterState() {
    // Restore time filter state
    const timeCheckbox = document.getElementById('enable-time-filter');
    const timeContent = document.getElementById('time-filter-content');
    
    if (timeCheckbox) {
      timeCheckbox.checked = this.timeFilterEnabled;
      timeCheckbox.disabled = this.timeFilterLocked;
      if (this.timeFilterEnabled) {
        timeContent.style.display = 'block';
      }
    }

    if (this.timeFilter) {
      document.getElementById('start-time-popup').value = formatDateTimeLocal(this.timeFilter.start);
      document.getElementById('end-time-popup').value = formatDateTimeLocal(this.timeFilter.end);
    }

    // Restore location filter state
    const locationCheckbox = document.getElementById('enable-location-filter');
    const locationContent = document.getElementById('location-filter-content');
    
    if (locationCheckbox) {
      locationCheckbox.checked = this.locationFilterEnabled;
      locationCheckbox.disabled = this.locationFilterLocked;
      if (this.locationFilterEnabled) {
        locationContent.style.display = 'block';
      }
    }

    if (this.locationFilter) {
      document.getElementById('location-lat-input').value = this.locationFilter.lat;
      document.getElementById('location-lng-input').value = this.locationFilter.lng;
      document.getElementById('location-radius-input').value = this.locationFilter.radius;
    }

    // Disable inputs if locked
    if (this.timeFilterLocked) {
      this.lockTimeFilterInputs();
    }
    if (this.locationFilterLocked) {
      this.lockLocationFilterInputs();
    }
  }

  lockTimeFilterInputs() {
    document.getElementById('start-time-popup').disabled = true;
    document.getElementById('end-time-popup').disabled = true;
    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.disabled = true);
  }

  lockLocationFilterInputs() {
    document.getElementById('location-lat-input').disabled = true;
    document.getElementById('location-lng-input').disabled = true;
    document.getElementById('location-radius-input').disabled = true;
    document.getElementById('select-on-map-btn').disabled = true;
  }

  unlockTimeFilterInputs() {
    document.getElementById('start-time-popup').disabled = false;
    document.getElementById('end-time-popup').disabled = false;
    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.disabled = false);
  }

  unlockLocationFilterInputs() {
    document.getElementById('location-lat-input').disabled = false;
    document.getElementById('location-lng-input').disabled = false;
    document.getElementById('location-radius-input').disabled = false;
    document.getElementById('select-on-map-btn').disabled = false;
  }

  activateHistoryMode() {
    if (this.tracker.isHistoryMode) {
      const historyBtn = document.getElementById('history-mode-btn');
      const changeFilterBtn = document.getElementById('change-filter-btn');
      const liveModeBtn = document.getElementById('live-mode-btn');
      
      historyBtn.style.display = 'none';
      changeFilterBtn.style.display = 'flex';
      liveModeBtn.style.display = 'flex';
      return;
    }

    this.tracker.isHistoryMode = true;
    const historyBtn = document.getElementById('history-mode-btn');
    const changeFilterBtn = document.getElementById('change-filter-btn');
    const liveModeBtn = document.getElementById('live-mode-btn');
    const trackBtn = document.getElementById('track-latest-btn');
    const modeIndicator = document.getElementById('mode-indicator');

    modeIndicator.className = 'mode-indicator history-mode';
    modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('historyModeBadge')}</span>`;

    historyBtn.style.display = 'none';
    changeFilterBtn.style.display = 'flex';
    liveModeBtn.style.display = 'flex';
    trackBtn.style.display = 'none';

    this.tracker.toggleTracking(false);
    this.tracker.mapManager.clearSelectedLocationMarker();
    this.tracker.selectedLocationIndex = -1;

    this.tracker.mapManager.clearAllMarkers();
    this.tracker.mapManager.clearTraceMarkers();
    this.tracker.mapManager.clearAllRoutes();
    this.tracker.routeCoords = [];
    this.tracker.mapManager.updateRouteLine();

    this.tracker.updateRefreshButtonState();
    this.tracker.updateUILanguage();
  }

  deactivateHistoryMode() {
    if (!this.tracker.isHistoryMode) return;

    this.tracker.isHistoryMode = false;
    const historyBtn = document.getElementById('history-mode-btn');
    const changeFilterBtn = document.getElementById('change-filter-btn');
    const liveModeBtn = document.getElementById('live-mode-btn');
    const trackBtn = document.getElementById('track-latest-btn');
    const modeIndicator = document.getElementById('mode-indicator');

    modeIndicator.className = 'mode-indicator live-mode';
    modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('liveModeBadge')}</span>`;

    historyBtn.style.display = 'flex';
    changeFilterBtn.style.display = 'none';
    liveModeBtn.style.display = 'none';
    trackBtn.style.display = 'flex';

    this.tracker.mapManager.clearAllMarkers();
    this.tracker.mapManager.clearTraceMarkers();
    this.tracker.mapManager.clearAllRoutes();
    this.tracker.filteredLocations = [];
    this.tracker.updateTimeFilterIndicator();

    this.tracker.loadInitialData();

    while (this.tracker.liveUpdateQueue.length > 0) {
      const queuedLocation = this.tracker.liveUpdateQueue.shift();
      this.tracker.applyLocationUpdate(queuedLocation);
    }

    this.tracker.updateRefreshButtonState();
    this.tracker.updateLocationSelection();
    this.tracker.hideNoFilterOverlay();
    this.tracker.updateUILanguage();
  }

  async applyUnifiedFilter() {
    const timeEnabled = this.timeFilterEnabled;
    const locationEnabled = this.locationFilterEnabled;

    if (!timeEnabled && !locationEnabled) {
      this.showError(this.tracker.t('selectAtLeastOneFilter') || 'Please enable at least one filter');
      return;
    }

    let timeValid = true;
    let locationValid = true;
    let hasResults = false;

    // Validate and check time filter if enabled
    if (timeEnabled) {
      const startInput = document.getElementById('start-time-popup');
      const endInput = document.getElementById('end-time-popup');
      const timeErrorElement = document.getElementById('time-validation-error');
      
      const timeResult = Validator.validateTimeFilter(startInput, endInput);
      if (!timeResult.isValid) {
        this.tracker.showValidationError(timeResult.error, document.getElementById('apply-unified-filter'), timeErrorElement);
        timeValid = false;
        this.greyOutTimeFilter();
      } else {
        this.timeFilter = {
          start: new Date(startInput.value),
          end: new Date(endInput.value)
        };
        this.tracker.clearValidationError(document.getElementById('apply-unified-filter'), timeErrorElement);
        this.ungreyTimeFilter();
      }
    }

    // Validate and check location filter if enabled
    if (locationEnabled) {
      const latInput = document.getElementById('location-lat-input');
      const lngInput = document.getElementById('location-lng-input');
      const radiusInput = document.getElementById('location-radius-input');
      const locationErrorElement = document.getElementById('location-validation-error');

      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      const radius = parseFloat(radiusInput.value);

      const locationResult = Validator.validateLocationFilter(lat, lng, radius);
      if (!locationResult.isValid) {
        this.tracker.showValidationError(locationResult.error, document.getElementById('apply-unified-filter'), locationErrorElement);
        locationValid = false;
        this.greyOutLocationFilter();
      } else {
        this.locationFilter = { lat, lng, radius };
        this.tracker.clearValidationError(document.getElementById('apply-unified-filter'), locationErrorElement);
        this.ungreyLocationFilter();
      }
    }

    if (!timeValid || !locationValid) {
      this.showError(this.tracker.t('fixValidationErrors') || 'Please fix validation errors to apply filter.');
      return;
    }

    // Clear combined error
    this.tracker.clearValidationError(document.getElementById('apply-unified-filter'), document.getElementById('combined-validation-error'));

    // Activate history mode FIRST
    if (!this.tracker.isHistoryMode) {
      this.activateHistoryMode();
      
      // ✅ ADD A SMALL DELAY TO ENSURE UI IS READY
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Load data based on enabled filters
    hasResults = await this.loadFilteredData();

    // If no results, grey out the problematic filter
    if (!hasResults) {
      if (timeEnabled && locationEnabled) {
        this.greyOutLocationFilter();
        this.showError(this.tracker.t('noResultsForFilters') || 'No results found. Try adjusting the location filter.');
      } else if (timeEnabled) {
        this.greyOutTimeFilter();
        this.showError(this.tracker.t('noResultsForTimeFilter') || 'No results found for this time range.');
      } else if (locationEnabled) {
        this.greyOutLocationFilter();
        this.showError(this.tracker.t('noResultsForLocationFilter') || 'No results found in this area.');
      }
      return;
    }

    this.tracker.updateTimeFilterIndicator();
    this.tracker.hideNoFilterOverlay();

    // Close popup and return to map
    const popup = document.getElementById('history-config-popup');
    if (popup) {
      popup.classList.remove('active');
    }
    
    // ✅ UPDATE UI AFTER EVERYTHING IS READY
    this.tracker.updateUILanguage();
  }

  greyOutTimeFilter() {
    const section = document.getElementById('time-filter-section');
    if (section) {
      section.style.opacity = '0.5';
      section.style.pointerEvents = 'none';
    }
  }

  ungreyTimeFilter() {
    const section = document.getElementById('time-filter-section');
    if (section) {
      section.style.opacity = '1';
      section.style.pointerEvents = 'auto';
    }
  }

  greyOutLocationFilter() {
    const section = document.getElementById('location-filter-section');
    if (section) {
      section.style.opacity = '0.5';
      section.style.pointerEvents = 'none';
    }
  }

  ungreyLocationFilter() {
    const section = document.getElementById('location-filter-section');
    if (section) {
      section.style.opacity = '1';
      section.style.pointerEvents = 'auto';
    }
  }

  async loadFilteredData() {
    try {
      let url = `${this.tracker.config.apiBaseUrl}/api/locations/`;
      let params = new URLSearchParams();

      // Build query based on enabled filters
      if (this.timeFilterEnabled && this.timeFilter) {
        url += 'range';
        params.append('start', this.timeFilter.start.toISOString());
        params.append('end', this.timeFilter.end.toISOString());
      } else if (this.locationFilterEnabled && this.locationFilter) {
        url += 'nearby';
        params.append('lat', this.locationFilter.lat);
        params.append('lng', this.locationFilter.lng);
        params.append('radius', this.locationFilter.radius);
      }

      // Add device filters
      const selectedDeviceIds = Array.from(this.tracker.selectedDevices);
      if (selectedDeviceIds.length > 0 && selectedDeviceIds.length < this.tracker.devices.size) {
        selectedDeviceIds.forEach(deviceId => {
          params.append('device', deviceId);
        });
      }

      const response = await fetch(`${url}?${params.toString()}`);
      
      if (response.ok) {
        let locations = await response.json();

        // If both filters are enabled, apply location filter to time results
        if (this.timeFilterEnabled && this.locationFilterEnabled && this.locationFilter) {
          locations = this.filterLocationsByDistance(locations, this.locationFilter);
        }

        this.tracker.filteredLocations = locations || [];

        if (this.tracker.filteredLocations.length === 0) {
          return false; // No results
        }

        this.tracker.mapManager.clearAllMarkers();
        this.tracker.displayFilteredLocations();
        this.tracker.updateRouteForFiltered();
        this.tracker.mapManager.fitMapToLocations(this.tracker.filteredLocations);
        
        // Check geofences
        if (this.tracker.geofenceManager) {
          await this.tracker.geofenceManager.checkHistoricalLocationsAgainstGeofences();
        }

        return true; // Has results
      } else {
        const errorText = await response.text();
        console.error('Failed to load filtered data:', response.status, errorText);
        this.tracker.showError('Failed to load data: ' + errorText);
        return false;
      }
    } catch (error) {
      console.error('Error loading filtered data:', error);
      this.tracker.showError('Failed to load data: ' + error.message);
      return false;
    }
  }

  filterLocationsByDistance(locations, locationFilter) {
    return locations.filter(loc => {
      const distance = this.calculateDistance(
        loc.latitude, loc.longitude,
        locationFilter.lat, locationFilter.lng
      );
      return distance <= locationFilter.radius;
    });
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  clearAllFilters() {
    // Clear time filter
    this.timeFilter = null;
    this.timeFilterEnabled = false;
    this.timeFilterLocked = false;
    document.getElementById('start-time-popup').value = '';
    document.getElementById('end-time-popup').value = '';
    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('enable-time-filter').checked = false;
    document.getElementById('enable-time-filter').disabled = false;
    document.getElementById('time-filter-content').style.display = 'none';
    this.unlockTimeFilterInputs();
    this.ungreyTimeFilter();

    // Clear location filter
    this.locationFilter = null;
    this.locationFilterEnabled = false;
    this.locationFilterLocked = false;
    document.getElementById('location-lat-input').value = '';
    document.getElementById('location-lng-input').value = '';
    document.getElementById('location-radius-input').value = '0.5';
    document.getElementById('enable-location-filter').checked = false;
    document.getElementById('enable-location-filter').disabled = false;
    document.getElementById('location-filter-content').style.display = 'none';
    this.unlockLocationFilterInputs();
    this.ungreyLocationFilter();

    // Clear validation errors
    this.tracker.clearValidationError(
      document.getElementById('apply-unified-filter'),
      document.getElementById('time-validation-error')
    );
    this.tracker.clearValidationError(
      document.getElementById('apply-unified-filter'),
      document.getElementById('location-validation-error')
    );
    this.tracker.clearValidationError(
      document.getElementById('apply-unified-filter'),
      document.getElementById('combined-validation-error')
    );

    // Deactivate history mode
    this.deactivateHistoryMode();

    this.tracker.updateTimeFilterIndicator();
    document.getElementById('history-config-popup').classList.remove('active');
  }

  setQuickTimeRange(hours) {
    const now = new Date();
    const endTime = new Date(now);
    const startTime = new Date(now - hours * 60 * 60 * 1000);

    document.getElementById('start-time-popup').value = formatDateTimeLocal(startTime);
    document.getElementById('end-time-popup').value = formatDateTimeLocal(endTime);
  }

  showError(message) {
    const errorElement = document.getElementById('combined-validation-error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.add('show');
      
      setTimeout(() => {
        errorElement.classList.remove('show');
      }, 5000);
    }
  }

  setupFilterButtons() {
    // Enable/disable time filter
    const timeCheckbox = document.getElementById('enable-time-filter');
    const timeContent = document.getElementById('time-filter-content');
    
    if (timeCheckbox) {
      timeCheckbox.addEventListener('change', (e) => {
        this.tracker.historyManager.timeFilterEnabled = e.target.checked;
        timeContent.style.display = e.target.checked ? 'block' : 'none';
        
        // Validate immediately if enabled
        if (e.target.checked) {
          this.validateTimeFilter();
        } else {
          this.tracker.clearValidationError(
            document.getElementById('apply-unified-filter'),
            document.getElementById('time-validation-error')
          );
        }
      });
    }

    // Enable/disable location filter
    const locationCheckbox = document.getElementById('enable-location-filter');
    const locationContent = document.getElementById('location-filter-content');
    
    if (locationCheckbox) {
      locationCheckbox.addEventListener('change', (e) => {
        this.tracker.historyManager.locationFilterEnabled = e.target.checked;
        locationContent.style.display = e.target.checked ? 'block' : 'none';
        
        // Validate immediately if enabled
        if (e.target.checked) {
          this.validateLocationFilter();
        } else {
          this.tracker.clearValidationError(
            document.getElementById('apply-unified-filter'),
            document.getElementById('location-validation-error')
          );
        }
      });
    }

    // Add real-time validation to time inputs
    const startInput = document.getElementById('start-time-popup');
    const endInput = document.getElementById('end-time-popup');
    
    if (startInput && endInput) {
      startInput.addEventListener('input', () => {
        if (this.tracker.historyManager.timeFilterEnabled) {
          this.validateTimeFilter();
        }
      });
      
      endInput.addEventListener('input', () => {
        if (this.tracker.historyManager.timeFilterEnabled) {
          this.validateTimeFilter();
        }
      });
    }

    // Add real-time validation to location inputs
    const latInput = document.getElementById('location-lat-input');
    const lngInput = document.getElementById('location-lng-input');
    const radiusInput = document.getElementById('location-radius-input');
    
    if (latInput && lngInput && radiusInput) {
      latInput.addEventListener('input', () => {
        if (this.tracker.historyManager.locationFilterEnabled) {
          this.validateLocationFilter();
        }
      });
      
      lngInput.addEventListener('input', () => {
        if (this.tracker.historyManager.locationFilterEnabled) {
          this.validateLocationFilter();
        }
      });
      
      radiusInput.addEventListener('input', () => {
        if (this.tracker.historyManager.locationFilterEnabled) {
          this.validateLocationFilter();
        }
      });
    }

    // Time filter quick ranges
    document.querySelectorAll('.quick-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hours = parseInt(btn.dataset.hours);
        this.tracker.historyManager.setQuickTimeRange(hours);
        
        // Update active state
        document.querySelectorAll('.quick-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Validate after setting
        if (this.tracker.historyManager.timeFilterEnabled) {
          this.validateTimeFilter();
        }
      });
    });

    // Apply unified filter
    const applyBtn = document.getElementById('apply-unified-filter');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        this.tracker.historyManager.applyUnifiedFilter();
      });
    }

    // Clear all filters
    const clearBtn = document.getElementById('clear-unified-filter');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.tracker.historyManager.clearAllFilters();
      });
    }

    // Select on map button
    const selectOnMapBtn = document.getElementById('select-on-map-btn');
    if (selectOnMapBtn) {
      selectOnMapBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.tracker.isSelectingLocationOnMap) {
          this.endMapLocationSelection();
          this.reopenHistoryConfigPopup();
        } else {
          this.startMapLocationSelection();
        }
      });
    }
  }

  validateTimeFilter() {
    const startInput = document.getElementById('start-time-popup');
    const endInput = document.getElementById('end-time-popup');
    const errorElement = document.getElementById('time-validation-error');
    const applyBtn = document.getElementById('apply-unified-filter');
    
    const result = Validator.validateTimeFilter(startInput, endInput);
    
    if (!result.isValid) {
      this.tracker.showValidationError(result.error, applyBtn, errorElement);
      return false;
    } else {
      this.tracker.clearValidationError(applyBtn, errorElement);
      return true;
    }
  }

  validateLocationFilter() {
    const latInput = document.getElementById('location-lat-input');
    const lngInput = document.getElementById('location-lng-input');
    const radiusInput = document.getElementById('location-radius-input');
    const errorElement = document.getElementById('location-validation-error');
    const applyBtn = document.getElementById('apply-unified-filter');
    
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    const radius = parseFloat(radiusInput.value);
    
    const result = Validator.validateLocationFilter(lat, lng, radius);
    
    if (!result.isValid) {
      this.tracker.showValidationError(result.error, applyBtn, errorElement);
      return false;
    } else {
      this.tracker.clearValidationError(applyBtn, errorElement);
      return true;
    }
  }

}
