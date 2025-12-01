import { formatDateTimeLocal } from '../utils/helpers.js';
import { Validator } from '../utils/validators.js';

export class UIManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
  }

  setupPopupMenu() {
    // Cleaned up setupPopupMenu - removed bottom-right menu logic
    const historyConfigPopup = document.getElementById('history-config-popup');
    const historyConfigClose = document.getElementById('history-config-close');

    const closeHistoryConfig = () => {
      if(historyConfigPopup) historyConfigPopup.classList.remove('active');
    };

    if (historyConfigClose) historyConfigClose.addEventListener('click', closeHistoryConfig);

    if (historyConfigPopup) {
      historyConfigPopup.querySelector('.popup-content').addEventListener('click', (e) => {
        e.stopPropagation();
      });

      historyConfigPopup.addEventListener('click', (e) => {
        if (e.target === historyConfigPopup) {
          closeHistoryConfig();
        }
      });
    }

    // ESC key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (historyConfigPopup && historyConfigPopup.classList.contains('active')) {
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
    const panelHamburger = document.getElementById('panel-hamburger');
    if (panelHamburger) {
      panelHamburger.addEventListener('click', () => {
        this.tracker.toggleSlidingPanel();
      });
    }

    const panelCloseBtn = document.querySelector('.panel-close-btn');
    if (panelCloseBtn) {
      panelCloseBtn.addEventListener('click', () => {
        this.tracker.toggleSlidingPanel();
      });
    }
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
    // Enable/disable time filter
    const timeCheckbox = document.getElementById('enable-time-filter');
    const timeContent = document.getElementById('time-filter-content');

    if (timeCheckbox) {
      timeCheckbox.addEventListener('change', (e) => {
        this.tracker.historyManager.timeFilterEnabled = e.target.checked;
        timeContent.style.display = e.target.checked ? 'block' : 'none';
      });
    }

    // Enable/disable location filter
    const locationCheckbox = document.getElementById('enable-location-filter');
    const locationContent = document.getElementById('location-filter-content');

    if (locationCheckbox) {
      locationCheckbox.addEventListener('change', (e) => {
        this.tracker.historyManager.locationFilterEnabled = e.target.checked;
        locationContent.style.display = e.target.checked ? 'block' : 'none';
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

  closeAllMenus() {
    // Close Main Popup Menu
    const popupMenu = document.getElementById('popup-menu');
    if (popupMenu) {
      popupMenu.classList.remove('active');
    }

    // Close Sliding Panel
    const slidingPanel = document.getElementById('sliding-panel');
    if (slidingPanel) {
      slidingPanel.classList.remove('open');
      this.tracker.slidingPanelOpen = false;
    }

    // Close History Config if open
    const historyConfig = document.getElementById('history-config-popup');
    if (historyConfig) {
      historyConfig.classList.remove('active');
    }
  }

  updateUILanguage() {
    const headerP = document.querySelector('.header p');
    if (headerP) headerP.textContent = this.tracker.t('subtitle');

    const trackBtn = document.getElementById('track-latest-btn');
    if (trackBtn) {
      const trackSpan = trackBtn.querySelector('span:last-child');
      if (trackSpan) {
        trackSpan.textContent = this.tracker.isTrackingLatest ? this.tracker.t('trackLatest') : this.tracker.t('trackingOff');
      }
    }

    const historyModeSpan = document.querySelector('#history-mode-btn span:last-child');
    if (historyModeSpan) historyModeSpan.textContent = this.tracker.t('historyMode');

    const changeFilterSpan = document.querySelector('#change-filter-btn span:last-child');
    if (changeFilterSpan) changeFilterSpan.textContent = this.tracker.t('changeFilter');

    const liveModeSpan = document.querySelector('#live-mode-btn span:last-child');
    if (liveModeSpan) liveModeSpan.textContent = this.tracker.t('liveMode');

    const menuTextBottom = document.querySelector('#menu-toggle-btn-bottom span:last-child');
    if (menuTextBottom) {
      menuTextBottom.textContent = this.tracker.t('menu');
    }

    const modeIndicator = document.getElementById('mode-indicator');
    if (modeIndicator) {
      if (this.tracker.isHistoryMode) {
        modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('historyModeBadge')}</span>`;
      } else {
        modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.tracker.t('liveModeBadge')}</span>`;
      }
    }

    const settingsTabTitle = document.getElementById('settings-tab-title');
    if (settingsTabTitle) {
      settingsTabTitle.textContent = this.tracker.t('settingsPanel');
    }

    // Popup menu elements
    const popupHeader = document.querySelector('#popup-menu .popup-header h2');
    if (popupHeader) popupHeader.textContent = this.tracker.t('controlsAndInfo');

    const controlsTab = document.querySelector('[data-tab="controls"]');
    if (controlsTab) controlsTab.textContent = this.tracker.t('controls');

    // Update the new Locations tab title in sliding panel
    const locationsTabTitle = document.getElementById('locations-tab-title');
    if (locationsTabTitle) locationsTabTitle.textContent = this.tracker.t('locations');

    const locationsTab = document.querySelector('[data-tab="locations"]');
    if (locationsTab) locationsTab.textContent = this.tracker.t('locations');

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

    const startTimeLabel = document.querySelector('label[for="start-time-popup"]');
    if (startTimeLabel) startTimeLabel.textContent = this.tracker.t('from');

    const endTimeLabel = document.querySelector('label[for="end-time-popup"]');
    if (endTimeLabel) endTimeLabel.textContent = this.tracker.t('to');

    // Filter overlays
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

    // Route legend
    const legendStart = document.getElementById('legend-start');
    const legendEnd = document.getElementById('legend-end');
    if (legendStart) legendStart.textContent = this.tracker.t('legendStart');
    if (legendEnd) legendEnd.textContent = this.tracker.t('legendEnd');

    // Filter tabs
    const timeFilterTabBtn = document.querySelector('#time-filter-tab-label');
    const locationFilterTabBtn = document.querySelector('#location-filter-tab-label');
    if (timeFilterTabBtn) timeFilterTabBtn.textContent = this.tracker.t('timeFilterTabLabel');
    if (locationFilterTabBtn) locationFilterTabBtn.textContent = this.tracker.t('locationFilterTabLabel');

    // Location filter labels
    const locationLatLabel = document.getElementById('location-lat-label');
    const locationLngLabel = document.getElementById('location-lng-label');
    const locationRadiusLabel = document.getElementById('location-radius-label');

    if (locationLatLabel) locationLatLabel.textContent = this.tracker.t('latitude');
    if (locationLngLabel) locationLngLabel.textContent = this.tracker.t('longitude');
    if (locationRadiusLabel) locationRadiusLabel.textContent = this.tracker.t('radiusKm');

    const selectOnMapText = document.getElementById('select-on-map-text');
    if (selectOnMapText) selectOnMapText.textContent = '🗺 ' + this.tracker.t('selectOnMap');

    // Geofence elements
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

    const historyConfigTitle = document.getElementById('history-config-title');
    if (historyConfigTitle) historyConfigTitle.textContent = this.tracker.t('historicalViewConfig');

    const unifiedFilterTitle = document.getElementById('unified-filter-title');
    if (unifiedFilterTitle) unifiedFilterTitle.textContent = this.tracker.t('filterConfiguration') || 'Filter Configuration';

    const timeFilterSectionLabel = document.getElementById('time-filter-section-label');
    if (timeFilterSectionLabel) timeFilterSectionLabel.textContent = this.tracker.t('timeFilterTabLabel');

    const locationFilterSectionLabel = document.getElementById('location-filter-section-label');
    if (locationFilterSectionLabel) locationFilterSectionLabel.textContent = this.tracker.t('locationFilterTabLabel');

    const startTimeLabel2 = document.getElementById('start-time-label');
    if (startTimeLabel2) startTimeLabel2.textContent = this.tracker.t('from');

    const endTimeLabel2 = document.getElementById('end-time-label');
    if (endTimeLabel2) endTimeLabel2.textContent = this.tracker.t('to');

    const applyFilterText = document.getElementById('apply-filter-text');
    if (applyFilterText) applyFilterText.textContent = this.tracker.t('applyFilter') || 'Apply Filter';

    const clearFilterText = document.getElementById('clear-filter-text');
    if (clearFilterText) clearFilterText.textContent = this.tracker.t('clearAllFilters') || 'Clear All';

    // Geofence legend
    const geofencesText = document.getElementById('geofences-text');
    if (geofencesText) geofencesText.textContent = this.tracker.t('geofences');

    const centerGeofencesText = document.getElementById('center-geofences-text');
    if (centerGeofencesText) centerGeofencesText.textContent = this.tracker.t('centerGeofences');

    // Geofence buttons
    const drawBtn = document.getElementById('draw-geofence-btn');
    if (drawBtn) drawBtn.title = this.tracker.t('drawNewGeofence');

    const toggleBtn = document.getElementById('toggle-geofences-btn');
    if (toggleBtn) {
      const showingGeofences = !this.tracker.geofenceManager || this.tracker.geofenceManager.showGeofences;
      toggleBtn.title = showingGeofences ? this.tracker.t('hideGeofences') : this.tracker.t('showGeofences');
    }

    const menuBtn = document.getElementById('open-geofence-menu-btn');
    if (menuBtn) menuBtn.title = this.tracker.t('geofenceManagement');

    // ✅ ADD NULL CHECK FOR PANEL ELEMENTS
    const vehiclesPanelTitle = document.getElementById('vehicles-panel-title');
    if (vehiclesPanelTitle) {
      vehiclesPanelTitle.textContent = this.tracker.t('vehiclesPanel');
    }

    const panelTitle = document.getElementById('panel-title');
    if (panelTitle) {
      panelTitle.textContent = this.tracker.t('vehiclesPanel');
    }

    // Route management translations
    const routeManagementTitle = document.getElementById('route-management-title');
    if (routeManagementTitle) routeManagementTitle.textContent = this.tracker.t('routeManagement');

    const createRouteBtnText = document.getElementById('create-route-btn-text');
    if (createRouteBtnText) createRouteBtnText.textContent = this.tracker.t('createRouteFromHistory');

    const reloadRoutesBtnText = document.getElementById('reload-routes-btn-text');
    if (reloadRoutesBtnText) reloadRoutesBtnText.textContent = this.tracker.t('reloadRoutes');

    const toggleRoutesVisibilityBtnText = document.getElementById('toggle-routes-visibility-btn-text');
    if (toggleRoutesVisibilityBtnText) toggleRoutesVisibilityBtnText.textContent = this.tracker.t('toggleRoutesVisibility');

    const routeStatsTitle = document.getElementById('route-stats-title');
    if (routeStatsTitle) routeStatsTitle.textContent = this.tracker.t('routeStats');

    const totalRoutesLabel = document.getElementById('total-routes-label');
    if (totalRoutesLabel) totalRoutesLabel.textContent = this.tracker.t('totalRoutes') + ':';

    const totalDistanceLabel = document.getElementById('total-distance-label');
    if (totalDistanceLabel) totalDistanceLabel.textContent = this.tracker.t('totalDistance') + ':';

    const routeListTitle = document.getElementById('route-list-title');
    if (routeListTitle) routeListTitle.textContent = this.tracker.t('activeRoutes');

    const noRoutesMsg = document.getElementById('no-routes-msg');
    if (noRoutesMsg) noRoutesMsg.textContent = this.tracker.t('noRoutesCreated');

    const routesLegendText = document.getElementById('routes-legend-text');
    if (routesLegendText) routesLegendText.textContent = this.tracker.t('routes');

    const centerRoutesText = document.getElementById('center-routes-text');
    if (centerRoutesText) centerRoutesText.textContent = this.tracker.t('centerOnRoutes');

    const createRouteBtn = document.getElementById('create-route-btn');
    if (createRouteBtn) createRouteBtn.title = this.tracker.t('createRouteFromHistory');

    const toggleRoutesBtn = document.getElementById('toggle-routes-btn');
    if (toggleRoutesBtn) {
      const showingRoutes = !this.tracker.routeManager || this.tracker.routeManager.showRoutes;
      toggleRoutesBtn.title = showingRoutes ? this.tracker.t('hideRoutes') : this.tracker.t('showRoutes');
    }

    // Geofence panel buttons
    const drawGeofencePanelText = document.getElementById('draw-geofence-panel-text');
    if (drawGeofencePanelText) drawGeofencePanelText.textContent = this.tracker.t('drawNewGeofence');

    const toggleGeofencePanelText = document.getElementById('toggle-geofence-panel-text');
    if (toggleGeofencePanelText) toggleGeofencePanelText.textContent = this.tracker.t('toggleVisibility');

    const reloadGeofencePanelText = document.getElementById('reload-geofence-panel-text');
    if (reloadGeofencePanelText) reloadGeofencePanelText.textContent = this.tracker.t('reloadGeofences');

    // Route panel buttons
    const createRoutePanelText = document.getElementById('create-route-panel-text');
    if (createRoutePanelText) createRoutePanelText.textContent = this.tracker.t('createRouteFromHistory');

    const toggleRoutePanelText = document.getElementById('toggle-route-panel-text');
    if (toggleRoutePanelText) toggleRoutePanelText.textContent = this.tracker.t('toggleVisibility');

    const reloadRoutePanelText = document.getElementById('reload-route-panel-text');
    if (reloadRoutePanelText) reloadRoutePanelText.textContent = this.tracker.t('reloadRoutes');

    const routeMenuBtn = document.getElementById('open-route-menu-btn');
    if (routeMenuBtn) routeMenuBtn.title = this.tracker.t('routeManagement');

    // Update connection status
    this.tracker.updateConnectionStatus(
      this.tracker.wsManager.isConnected() ? this.tracker.t('connected') : this.tracker.t('connecting'),
      this.tracker.wsManager.isConnected() ? 'connected' : 'disconnected'
    );

    // Update components
    this.tracker.updateTimeFilterIndicator();
    this.tracker.displayLocations();
    this.tracker.deviceManager.updateDeviceLegend();

    // Update panels
    if (this.tracker.vehiclePanelManager) {
      this.tracker.vehiclePanelManager.updateVehiclePanel();
    }

    if (this.tracker.geofenceManager) {
      this.tracker.geofenceManager.updateGeofenceLegend();
      this.tracker.geofenceManager.updateGeofenceList();
    }

    if (this.tracker.routeManager) {
      this.tracker.routeManager.updateRouteLegend();
      this.tracker.routeManager.updateRouteList();
    }
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
