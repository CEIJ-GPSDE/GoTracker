import { formatDateTimeLocal } from '../utils/helpers.js';
import { Validator } from '../utils/validators.js';

export class UIManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
  }

  setupPopupMenu() {
    const menuToggle = document.getElementById('menu-toggle-btn');
    const popupMenu = document.getElementById('popup-menu');
    const popupClose = document.getElementById('popup-close');
    const historyConfigPopup = document.getElementById('history-config-popup');
    const historyConfigClose = document.getElementById('history-config-close');
    

    menuToggle.addEventListener('click', () => {
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
        this.tracker.openHistoryConfigPopup();
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
        this.tracker.openHistoryConfigPopup();
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
    document.getElementById('track-latest-btn').addEventListener('click', () => {
      this.tracker.userInteracted = false;
      this.tracker.suppressUserInteraction = false;
      this.tracker.selectedLocationIndex = -1;
      this.tracker.toggleTracking(true);
      this.tracker.updateLocationSelection();
      this.setupCombinedFilterListeners();
    });

    document.getElementById('history-mode-btn').addEventListener('click', () => {
      this.tracker.historyManager.toggleHistoryMode();
    });

    document.getElementById('live-mode-btn').addEventListener('click', () => {
      this.tracker.historyManager.toggleHistoryMode();
    });

    document.getElementById('history-config-btn').addEventListener('click', () => {
      this.tracker.openHistoryConfigPopup();
    });

    document.getElementById('toggle-trace-dots').addEventListener('change', (e) => {
      this.tracker.showTraceDots = e.target.checked;
      this.tracker.applyTraceDotsVisibility();
    });

    document.getElementById('history-limit').addEventListener('change', (e) => {
      this.tracker.historyLimit = parseInt(e.target.value);
      this.tracker.refreshData();
    });

    document.getElementById('language-selector').addEventListener('change', (e) => {
      this.tracker.setLanguage(e.target.value);
    });

    window.addEventListener('focus', () => {
      if (this.tracker.wsManager.ws && this.tracker.wsManager.ws.readyState !== WebSocket.OPEN) {
        this.tracker.wsManager.connect();
      }
    });
  }
  setupCombinedFilterListeners() {
    const applyBtn = document.getElementById('apply-combined-filter');
    const clearBtn = document.getElementById('clear-combined-filter');
    const validationError = document.getElementById('combined-validation-error');

    applyBtn.addEventListener('click', () => {
      // Time and location values
      const startTime = document.getElementById('start-time-popup').value;
      const endTime = document.getElementById('end-time-popup').value;
      const lat = document.getElementById('location-lat-input').value;
      const lng = document.getElementById('location-lng-input').value;
      const radius = document.getElementById('location-radius-input').value;

      // Validation
      let error = null;
      if ((lat && !lng) || (!lat && lng)) {
        error = 'Both latitude and longitude must be provided for location filter.';
      }
      if ((lat && lng) && (!radius || radius <= 0)) {
        error = 'Radius required and must be positive for a location filter.';
      }
      if ((startTime && !endTime) || (!startTime && endTime)) {
        error = 'Both start and end time must be provided for a time filter.';
      }
      if (error) {
        validationError.textContent = error;
        validationError.classList.add('show');
        return;
      } else {
        validationError.classList.remove('show');
        validationError.textContent = '';
      }

      this.tracker.applyCombinedFilter({
        time: startTime && endTime ? { start: startTime, end: endTime } : null,
        location: lat && lng && radius ? { lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius) } : null
      });
    });

    clearBtn.addEventListener('click', () => {
      document.getElementById('start-time-popup').value = '';
      document.getElementById('end-time-popup').value = '';
      document.getElementById('location-lat-input').value = '';
      document.getElementById('location-lng-input').value = '';
      document.getElementById('location-radius-input').value = '';
      validationError.classList.remove('show');
      validationError.textContent = '';
      // clear filters (method could be implemented later)
      //this.tracker.clearCombinedFilter();
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
    document.querySelector('#history-config-btn span:last-child').textContent = this.tracker.t('historySettings');
    document.querySelector('#live-mode-btn span:last-child').textContent = this.tracker.t('liveMode');
    document.querySelector('#menu-toggle-btn span:last-child').textContent = this.tracker.t('menu');

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

    const noFilterSelectedTitle = document.getElementById('no-filter-selected-title');
    const pleaseSelectFilter = document.getElementById('please-select-filter');
    const selectFilterTab = document.getElementById('select-filter-tab');

    if (noFilterSelectedTitle) noFilterSelectedTitle.textContent = this.tracker.t('noFilterSelected');
    if (pleaseSelectFilter) pleaseSelectFilter.textContent = this.tracker.t('pleaseSelectFilter');
    if (selectFilterTab) selectFilterTab.textContent = this.tracker.t('selectFilterTab');

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

    const deviceLegendTitle = document.querySelector('#device-legend h4');
    if (deviceLegendTitle) {
      const countSpan = deviceLegendTitle.querySelector('#device-count');
      deviceLegendTitle.innerHTML = `📱 ${this.tracker.t('devices')} ${countSpan ? countSpan.outerHTML : ''}`;
    }

    const filterDevicesTitle = document.querySelector('#controls-tab .device-filter-section h4');
    if (filterDevicesTitle) {
      filterDevicesTitle.innerHTML = `📱 ${this.tracker.t('filterDevices')}`;
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
    if (selectOnMapText) selectOnMapText.textContent = '📍 ' + this.tracker.t('selectOnMap');

    this.tracker.updateConnectionStatus(
      this.tracker.wsManager.isConnected() ? this.tracker.t('connected') : this.tracker.t('connecting'),
      this.tracker.wsManager.isConnected() ? 'connected' : 'disconnected'
    );
    this.tracker.updateTimeFilterIndicator();
    this.tracker.displayLocations();
    this.tracker.deviceManager.updateDeviceLegend();
    this.tracker.deviceManager.updateDeviceFilterList();
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
