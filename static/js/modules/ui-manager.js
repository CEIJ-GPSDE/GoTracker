import { formatDateTimeLocal } from '../utils/helpers.js';
import { Validator } from '../utils/validators.js';

export class UIManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
  }

  setupPopupMenu() {
    const menuToggleBottom = document.getElementById('menu-toggle-btn-bottom');
    const popupMenu = document.getElementById('popup-menu');
    const popupClose = document.getElementById('popup-close');
    const historyConfigPopup = document.getElementById('history-config-popup');
    const historyConfigClose = document.getElementById('history-config-close');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    menuToggleBottom.addEventListener('click', () => {
      popupMenu.classList.add('active');
    });

    const closeMenu = () => {
      popupMenu.classList.remove('active');
    };

    const closeHistoryConfig = () => {
      historyConfigPopup.classList.remove('active');
    };

    popupClose.addEventListener('click', closeMenu);
    historyConfigClose.addEventListener('click', closeHistoryConfig);

    popupMenu.querySelector('.popup-content').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    historyConfigPopup.querySelector('.popup-content').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    popupMenu.addEventListener('click', (e) => {
      if (e.target === popupMenu) {
        closeMenu();
      }
    });

    historyConfigPopup.addEventListener('click', (e) => {
      if (e.target === historyConfigPopup) {
        closeHistoryConfig();
      }
    });

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset.tab;

        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${tabId}-tab`) {
            content.classList.add('active');
          }
        });
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (popupMenu.classList.contains('active')) {
          closeMenu();
        }
        if (historyConfigPopup.classList.contains('active')) {
          closeHistoryConfig();
        }
      }
    });
  }

  setupOverlayEventListeners() {
    const noFilterOpenBtn = document.getElementById('no-filter-open-settings-btn');
    const noFilterDismissBtn = document.getElementById('no-filter-dismiss-btn');
    const emptyResultsAdjustBtn = document.getElementById('empty-results-adjust-btn-element');
    const emptyResultsDismissBtn = document.getElementById('empty-results-dismiss-btn-element');

    if (noFilterOpenBtn) {
      noFilterOpenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tracker.hideNoFilterOverlay();
        this.tracker.historyManager.openHistoryConfig();
      });
    }

    if (noFilterDismissBtn) {
      noFilterDismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tracker.hideNoFilterOverlay();
      });
    }

    if (emptyResultsAdjustBtn) {
      emptyResultsAdjustBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tracker.hideNoResultsOverlay()
        this.tracker.historyManager.openHistoryConfig();
      });
    }

    if (emptyResultsDismissBtn) {
      emptyResultsDismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tracker.hideNoResultsOverlay()
      });
    }

    const noFilterOverlay = document.getElementById('no-filter-overlay');
    const emptyResultsPopup = document.getElementById('empty-results-popup');

    if (noFilterOverlay) {
      noFilterOverlay.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    if (emptyResultsPopup) {
      emptyResultsPopup.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  setupEventListeners() {
    // Track Latest button
    document.getElementById('track-latest-btn').addEventListener('click', () => {
      this.tracker.userInteracted = false;
      this.tracker.suppressUserInteraction = false;
      this.tracker.selectedLocationIndex = -1;
      this.tracker.toggleTracking(true);
      this.tracker.updateLocationSelection();
    });

    // History Mode button
    document.getElementById('history-mode-btn').addEventListener('click', () => {
      this.tracker.historyManager.openHistoryConfig();
    });

    // Change Filter button
    document.getElementById('change-filter-btn').addEventListener('click', () => {
      this.tracker.historyManager.openHistoryConfig();
    });

    // Live Mode button
    document.getElementById('live-mode-btn').addEventListener('click', () => {
      this.tracker.historyManager.deactivateHistoryMode();
    });

    // Trace dots toggle
    document.getElementById('toggle-trace-dots').addEventListener('change', (e) => {
      this.tracker.showTraceDots = e.target.checked;
      this.tracker.applyTraceDotsVisibility();
    });

    // Clustering toggle
    const clusteringToggle = document.getElementById('toggle-clustering');
    if (clusteringToggle) {
      clusteringToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.tracker.enableClustering();
        } else {
          this.tracker.disableClustering();
        }
      });
    }

    // History limit
    document.getElementById('history-limit').addEventListener('change', (e) => {
      this.tracker.historyLimit = parseInt(e.target.value);
      this.tracker.refreshData();
    });

    // Language selector
    document.getElementById('language-selector').addEventListener('change', (e) => {
      this.tracker.setLanguage(e.target.value);
    });

    // Window focus handler
    window.addEventListener('focus', () => {
      if (this.tracker.wsManager.ws && this.tracker.wsManager.ws.readyState !== WebSocket.OPEN) {
        this.tracker.wsManager.connect();
      }
    });

    // Setup filter application buttons
    this.setupFilterButtons();
  }

  setupFilterButtons() {
    // Time filter quick ranges
    document.querySelectorAll('.quick-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hours = parseInt(btn.dataset.hours);
        this.tracker.historyManager.setQuickTimeRange(hours);
        
        // Update active state
        document.querySelectorAll('.quick-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Apply time filter
    const applyTimeBtn = document.getElementById('apply-time-filter-popup');
    if (applyTimeBtn) {
      applyTimeBtn.addEventListener('click', () => {
        this.tracker.historyManager.applyTimeFilterFromPopup();
      });
    }

    // Clear time filter
    const clearTimeBtn = document.getElementById('clear-time-filter-popup');
    if (clearTimeBtn) {
      clearTimeBtn.addEventListener('click', () => {
        this.tracker.historyManager.clearTimeFilter();
      });
    }

    // Apply location filter
    const applyLocationBtn = document.getElementById('apply-location-filter');
    if (applyLocationBtn) {
      applyLocationBtn.addEventListener('click', () => {
        this.tracker.historyManager.applyLocationFilterFromPopup();
      });
    }

    // Clear location filter
    const clearLocationBtn = document.getElementById('clear-location-filter');
    if (clearLocationBtn) {
      clearLocationBtn.addEventListener('click', () => {
        this.tracker.historyManager.clearLocationFilter();
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

  startMapLocationSelection() {
    this.tracker.isSelectingLocationOnMap = true;
    const selectBtn = document.getElementById('select-on-map-btn');
    const historyConfigPopup = document.getElementById('history-config-popup');
    
    const activeTab = document.querySelector('#history-config-popup .tab-button.active');
    if (activeTab) {
      this.tracker.historyManager.lastActiveConfigTab = activeTab.dataset.tab;
    }
    
    if (historyConfigPopup) {
      historyConfigPopup.classList.remove('active');
    }
    
    selectBtn.textContent = '✖ ' + this.tracker.t('cancelSelection');
    selectBtn.classList.add('secondary');
    
    const mapContainer = document.getElementById('map');
    mapContainer.style.cursor = 'crosshair';

    this.tracker.mapSelectionHandler = (e) => {
      const {lng, lat} = e.lngLat;
      
      document.getElementById('location-lat-input').value = lat.toFixed(6);
      document.getElementById('location-lng-input').value = lng.toFixed(6);
      
      this.endMapLocationSelection();
      this.reopenHistoryConfigPopup();
      
      console.log(this.tracker.t('locationSelected'), `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`);
    };

    this.tracker.mapManager.map.once('click', this.tracker.mapSelectionHandler);

    selectBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.endMapLocationSelection();
      this.reopenHistoryConfigPopup();
    };
  }

  endMapLocationSelection() {
    this.tracker.isSelectingLocationOnMap = false;
    const selectBtn = document.getElementById('select-on-map-btn');
    const mapContainer = document.getElementById('map');
    
    selectBtn.textContent = '🗺 ' + this.tracker.t('selectOnMap');
    selectBtn.classList.remove('secondary');
    
    mapContainer.style.cursor = '';
    
    if (this.tracker.mapSelectionHandler) {
      this.tracker.mapManager.map.off('click', this.tracker.mapSelectionHandler);
      this.tracker.mapSelectionHandler = null;
    }

    selectBtn.onclick = null;
  }

  reopenHistoryConfigPopup() {
    const historyConfigPopup = document.getElementById('history-config-popup');
    const lastTab = this.tracker.historyManager.lastActiveConfigTab || 'location-filter';
    
    if (historyConfigPopup) {
      historyConfigPopup.classList.add('active');
    }
    
    const tabButtons = document.querySelectorAll('#history-config-popup .tab-button');
    const tabContents = document.querySelectorAll('#history-config-popup .tab-content');
    
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === lastTab) {
        btn.classList.add('active');
      }
    });
    
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${lastTab}-tab`) {
        content.classList.add('active');
      }
    });
  }

  initializeTimePickers() {
    const now = new Date();
    const endTime = new Date(now);
    const startTime = new Date(now - 24 * 60 * 60 * 1000);

    document.getElementById('end-time-popup').value = formatDateTimeLocal(endTime);
    document.getElementById('start-time-popup').value = formatDateTimeLocal(startTime);
  }

  updateUILanguage() {
    document.querySelector('.header p').textContent = this.tracker.t('subtitle');

    const trackBtn = document.getElementById('track-latest-btn');
    if (trackBtn) {
      trackBtn.querySelector('span:last-child').textContent =
        this.tracker.isTrackingLatest ? this.tracker.t('trackLatest') : this.tracker.t('trackingOff');
    }

    document.querySelector('#history-mode-btn span:last-child').textContent = this.tracker.t('historyMode');
    document.querySelector('#change-filter-btn span:last-child').textContent = this.tracker.t('changeFilter');
    document.querySelector('#live-mode-btn span:last-child').textContent = this.tracker.t('liveMode');
    
    const menuTextBottom = document.querySelector('#menu-toggle-btn-bottom span:last-child');
    if (menuTextBottom) {
      menuTextBottom.textContent = this.tracker.t('menu');
    }

    const modeIndicator = document.getElementById('mode-indicator');
    if (this.tracker.isHistoryMode) {
      modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('historyModeBadge')}</span>`;
    } else {
      modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('liveModeBadge')}</span>`;
    }

    document.querySelector('#popup-menu .popup-header h2').textContent = this.tracker.t('controlsAndInfo');
    document.querySelector('[data-tab="controls"]').textContent = this.tracker.t('controls');
    document.querySelector('[data-tab="locations"]').textContent = this.tracker.t('locations');

    const historyLimitLabel = document.querySelector('label[for="history-limit"]');
    if (historyLimitLabel) {
      historyLimitLabel.textContent = this.tracker.t('historyLimit');
    }

    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
      refreshBtn.textContent = this.tracker.isHistoryMode ? this.tracker.t('refreshDataHistorical') : this.tracker.t('refreshData');
    }

    const traceDotsLabel = document.getElementById('trace-dots-label');
    if (traceDotsLabel) {
      traceDotsLabel.textContent = this.tracker.t('showTraceDots');
    }

    document.querySelector('#history-config-popup .popup-header h2').textContent = this.tracker.t('historicalViewConfig');
    document.querySelector('label[for="start-time-popup"]').textContent = this.tracker.t('from');
    document.querySelector('label[for="end-time-popup"]').textContent = this.tracker.t('to');
    document.getElementById('apply-time-filter-popup').textContent = this.tracker.t('applyTimeFilter');
    document.getElementById('clear-time-filter-popup').textContent = this.tracker.t('clearFilter');

    const noFilterTitle = document.getElementById('no-filter-title');
    const noFilterMessage = document.getElementById('no-filter-message');
    const noFilterBtnText = document.getElementById('no-filter-btn-text');
    const noFilterDismissText = document.getElementById('no-filter-dismiss-text');

    if (noFilterTitle) noFilterTitle.textContent = this.tracker.t('noFilterTitle');
    if (noFilterMessage) noFilterMessage.textContent = this.tracker.t('noFilterMessage');
    if (noFilterBtnText) noFilterBtnText.textContent = this.tracker.t('openHistorySettings');
    if (noFilterDismissText) noFilterDismissText.textContent = this.tracker.t('dismiss');

    const emptyResultsTitle = document.getElementById('empty-results-title');
    const emptyResultsMessage = document.getElementById('empty-results-message');
    const emptyResultsAdjustBtn = document.getElementById('empty-results-adjust-btn');
    const emptyResultsDismissBtn = document.getElementById('empty-results-dismiss-btn');

    if (emptyResultsTitle) emptyResultsTitle.textContent = '⚠️ ' + this.tracker.t('noResultsTitle');
    if (emptyResultsMessage) emptyResultsMessage.textContent = this.tracker.t('noResultsMessage');
    if (emptyResultsAdjustBtn) emptyResultsAdjustBtn.textContent = this.tracker.t('adjustFilters');
    if (emptyResultsDismissBtn) emptyResultsDismissBtn.textContent = this.tracker.t('dismiss');

    const legendStart = document.getElementById('legend-start');
    const legendEnd = document.getElementById('legend-end');
    if (legendStart) legendStart.textContent = this.tracker.t('legendStart');
    if (legendEnd) legendEnd.textContent = this.tracker.t('legendEnd');

    const devicesText = document.getElementById('devices-text');
    if (devicesText) {
      devicesText.textContent = this.tracker.t('devices');
    }

    const centerDevicesText = document.getElementById('center-devices-text');
    if (centerDevicesText) {
      centerDevicesText.textContent = this.tracker.t('centerOnDevices');
    }

    const timeFilterTabBtn = document.querySelector('#time-filter-tab-label');
    const locationFilterTabBtn = document.querySelector('#location-filter-tab-label');
    if (timeFilterTabBtn) timeFilterTabBtn.textContent = this.tracker.t('timeFilterTabLabel');
    if (locationFilterTabBtn) locationFilterTabBtn.textContent = this.tracker.t('locationFilterTabLabel');

    const locationLatLabel = document.getElementById('location-lat-label');
    const locationLngLabel = document.getElementById('location-lng-label');
    const locationRadiusLabel = document.getElementById('location-radius-label');
    const applyLocationBtn = document.getElementById('apply-location-filter');
    const clearLocationBtn = document.getElementById('clear-location-filter');

    if (locationLatLabel) locationLatLabel.textContent = this.tracker.t('latitude');
    if (locationLngLabel) locationLngLabel.textContent = this.tracker.t('longitude');
    if (locationRadiusLabel) locationRadiusLabel.textContent = this.tracker.t('radiusKm');
    if (applyLocationBtn) applyLocationBtn.textContent = this.tracker.t('applyLocationFilter');
    if (clearLocationBtn) clearLocationBtn.textContent = this.tracker.t('clearFilter');

    const selectOnMapText = document.getElementById('select-on-map-text');
    if (selectOnMapText) selectOnMapText.textContent = '🗺 ' + this.tracker.t('selectOnMap');
    const geofenceManagementTitle = document.getElementById('geofence-management-title');
    if (geofenceManagementTitle) geofenceManagementTitle.textContent = this.tracker.t('geofenceManagement');

    const drawGeofenceBtnText = document.getElementById('draw-geofence-btn-text');
    if (drawGeofenceBtnText) drawGeofenceBtnText.textContent = this.tracker.t('drawNewGeofence');

    const reloadGeofencesBtnText = document.getElementById('reload-geofences-btn-text');
    if (reloadGeofencesBtnText) reloadGeofencesBtnText.textContent = this.tracker.t('reloadGeofences');

    const toggleVisibilityBtnText = document.getElementById('toggle-visibility-btn-text');
    if (toggleVisibilityBtnText) toggleVisibilityBtnText.textContent = this.tracker.t('toggleVisibility');

    const geofenceStatsTitle = document.getElementById('geofence-stats-title');
    if (geofenceStatsTitle) geofenceStatsTitle.textContent = this.tracker.t('geofenceStats');

    const totalGeofencesLabel = document.getElementById('total-geofences-label');
    if (totalGeofencesLabel) totalGeofencesLabel.textContent = this.tracker.t('totalGeofences') + ':';

    const activeGeofencesLabel = document.getElementById('active-geofences-label');
    if (activeGeofencesLabel) activeGeofencesLabel.textContent = this.tracker.t('activeGeofences') + ':';

    const devicesInsideLabel = document.getElementById('devices-inside-label');
    if (devicesInsideLabel) devicesInsideLabel.textContent = this.tracker.t('devicesInside') + ':';

    const totalViolationsLabel = document.getElementById('total-violations-label');
    if (totalViolationsLabel) totalViolationsLabel.textContent = this.tracker.t('totalAlerts') + ':';

    const geofenceListTitle = document.getElementById('geofence-list-title');
    if (geofenceListTitle) geofenceListTitle.textContent = this.tracker.t('activeGeofencesTitle');

    const noGeofencesMsg = document.getElementById('no-geofences-msg');
    if (noGeofencesMsg) noGeofencesMsg.textContent = this.tracker.t('noGeofencesCreated');

    // Update geofence list to reflect language changes
    if (this.tracker.geofenceManager) {
      this.tracker.geofenceManager.updateGeofenceList();
    } 

    this.tracker.updateConnectionStatus(
      this.tracker.wsManager.isConnected() ? this.tracker.t('connected') : this.tracker.t('connecting'),
      this.tracker.wsManager.isConnected() ? 'connected' : 'disconnected'
    );
    this.tracker.updateTimeFilterIndicator();
    this.tracker.displayLocations();
    this.tracker.deviceManager.updateDeviceLegend();
  }

  updateRefreshButtonState() {
    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
      if (this.tracker.isHistoryMode) {
        refreshBtn.disabled = true;
        refreshBtn.style.opacity = '0.5';
        refreshBtn.style.cursor = 'not-allowed';
        refreshBtn.textContent = 'Refresh Data (Historical Mode)';
      } else {
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
        refreshBtn.style.cursor = 'pointer';
        refreshBtn.textContent = 'Refresh Data';
      }
    }
  }

  showValidationError(message, button, errorElement) {
    let translatedMessage = message;

    if (message === 'validLocationRequired' || message === 'invalidCoordinates' || message === 'invalidRadius') {
      translatedMessage = this.tracker.t(message);
    } else {
      const validationKey = `validationErrors.${message}`;
      const translated = this.tracker.t(validationKey);
      if (translated !== validationKey) {
        translatedMessage = translated;
      }
    }

    errorElement.textContent = translatedMessage;
    errorElement.classList.add('show');
    button.disabled = true;
    button.title = translatedMessage;
  }

  clearValidationError(button, errorElement) {
    errorElement.classList.remove('show');
    button.disabled = false;
    button.title = '';
  }
}
