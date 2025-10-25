class LocationTracker {
  constructor() {
    this.ws = null;
    this.map = null;
    this.markers = new Map();
    this.locations = [];
    this.devices = new Map(); // Map<deviceId, {color, visible, count}>
    this.selectedDevices = new Set(); // Devices to show
    this.deviceColors = [
      '#ef4444', '#10b981', '#3b82f6', '#f59e0b',
      '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'
    ];
    this.filteredLocations = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.historyLimit = 50;
    this.isTrackingLatest = true;
    this.selectedLocationIndex = -1;
    this.userInteracted = false;
    this.routeCoords = [];
    this.isHistoryMode = false;
    this.timeFilter = null;
    this.suppressUserInteraction = false;
    this.traceMarkers = [];
    this.showTraceDots = true;
    this.liveUpdateQueue = [];
    this.persistedTimeFilter = null;
    this.selectedLocationMarker = null;
    this.persistedLocationFilter = null;
    this.liveLocations = [];
    this.initialDbLocation = null;
    this.hasReceivedLiveUpdate = false;
    this.locationFilter = null;
    this.activeFilterType = null;
    this.isSelectingLocationOnMap = false;
    this.mapSelectionHandler = null;
    this.lastActiveConfigTab = 'time-filter';
    this.translations = {
      en: {
        title: "🌍 Real-time Location Tracker",
        subtitle: "Monitoring device locations with live updates and historical view",
        connecting: "Connecting...",
        connected: "Connected",
        disconnected: "Disconnected",
        connectionError: "Connection Error",
        reconnecting: "Reconnecting in {0}s... ({1}/{2})",
        connectionFailed: "Connection failed - refresh page",
        trackLatest: "Track Latest",
        trackingOff: "Tracking Off",
        historyMode: "History Mode",
        historySettings: "History Settings",
        liveMode: "Live Mode",
        menu: "Menu",
        liveModeBadge: "🔴 LIVE MODE",
        historyModeBadge: "📅 HISTORY MODE",
        legendStart: "Start (oldest)",
        legendEnd: "End (newest)",
        filterLabel: "Filter:",
        to: "to",
        noTimeFilterApplied: "No time filter applied",
        configureInHistorySettings: "Configure in History Settings",
        controlsAndInfo: "Controls & Information",
        controls: "⚙️ Controls",
        locations: "📍 Locations",
        filterByDevice: "Filter by Device:",
        allDevices: "All Devices",
        historyLimit: "History Limit:",
        refreshData: "Refresh Data",
        refreshDataHistorical: "Refresh Data (Historical Mode)",
        showTraceDots: "Show trace dots",
        loadingLocations: "Loading locations...",
        historicalViewConfig: "📅 Historical View Configuration",
        quickRanges: ["1h", "6h", "24h", "1w", "All"],
        from: "From:",
        to: "To:",
        applyTimeFilter: "Apply Time Filter",
        clearFilter: "Clear Filter",
        noResultsTitle: "No Results Found",
        noResultsMessage: "No location data matches your filter criteria. Try adjusting the parameters.",
        noLocationResultsMessage: "No location data found within {radius} km of the selected coordinates.",
        adjustFilters: "Adjust Filters",
        noLocationsFound: "No locations found",
        ok: "OK",
        deviceId: "Device ID",
        coordinates: "Coordinates",
        time: "Time",
        start: "START",
        end: "END",
        selected: "SELECTED",
        clearSelection: "Clear Selection",
        noTimeFilter: "No time filter applied",
        configureInSettings: "Configure in History Settings",
        filterLabel: "Filter:",
        timeFilterTabLabel: "Time Filter",
        locationFilterTabLabel: "Location Filter",
        latitude: "Latitude",
        longitude: "Longitude",
        radiusKm: "Radius (km)",
        applyLocationFilter: "Apply Location Filter",
        validLocationRequired: "Valid latitude and longitude are required",
        invalidCoordinates: "Invalid coordinates (lat: -90 to 90, lng: -180 to 180)",
        invalidRadius: "Radius must be greater than 0",
        noFilterTitle: "⚠️ No Time Filter Applied",
        noFilterMessage: "Please configure a time filter in History Settings to view historical data.",
        openHistorySettings: "Open History Settings",
        dismiss: "Dismiss",
        timeFilterActive: "⏱️ Time Filter:",
        locationFilterActive: "📍 Location Filter:",
        latitude: "Latitude",
        longitude: "Longitude",
        radiusLabel: "Radius:",
        km: "km",
        noFilterSelected: "No filter selected",
        pleaseSelectFilter: "Please select a time range or location to view historical data.",
        selectFilterTab: "Choose a tab above to configure your filter.",
        noFilterTitle: "⚠️ No Filter Applied",
        noFilterMessage: "Please configure a filter in History Settings to view historical data.",
        selectOnMap: "Select on Map",
        selectLocationOnMap: "Click on the map to select a location",
        clickMapToSelect: "Click anywhere on the map to set the location for filtering",
        cancelSelection: "Cancel",
        locationSelected: "Location selected! Coordinates updated.",
        noFilterOpenSettings: "Open History Settings",
        noFilterDismiss: "Dismiss",
        emptyResultsAdjust: "Adjust Filters",
        emptyResultsDismiss: "Dismiss",
        loadingLocations: "Loading locations...",
        noLocationsFound: "No locations found",
        devices: "Devices",
        noDevicesFound: "No devices found",
        locationsCount: "{0} locations",
        filterDevices: "Filter Devices",
        validationErrors: {
          required: "Both start and end times are required",
          invalidFormat: "Invalid date format",
          startAfterEnd: "Start time must be before end time",
          futureEnd: "End time cannot be in the future",
          rangeTooLarge: "Time range cannot exceed 1 year",
          rangeTooSmall: "Time range must be at least 1 minute",
          tooFarBack: "Start time cannot be more than 10 years ago"
        }
      },
      es: {
        title: "🌍 Rastreador de Ubicación en Tiempo Real",
        subtitle: "Monitoreando ubicaciones de dispositivos con actualizaciones en vivo y vista histórica",
        connecting: "Conectando...",
        connected: "Conectado",
        disconnected: "Desconectado",
        connectionError: "Error de Conexión",
        reconnecting: "Reconectando en {0}s... ({1}/{2})",
        connectionFailed: "Conexión fallida - actualice la página",
        trackLatest: "Seguir Último",
        trackingOff: "Seguimiento Desactivado",
        historyMode: "Modo Histórico",
        historySettings: "Configuración Histórica",
        liveMode: "Modo en Vivo",
        menu: "Menú",
        liveModeBadge: "🔴 MODO EN VIVO",
        historyModeBadge: "📅 MODO HISTÓRICO",
        legendStart: "Inicio (más antiguo)",
        legendEnd: "Fin (más reciente)",
        filterLabel: "Filtro:",
        to: "hasta",
        noTimeFilterApplied: "No se aplicó filtro de tiempo",
        configureInHistorySettings: "Configurar en Ajustes de Historial",
        controlsAndInfo: "Controles e Información",
        controls: "⚙️ Controles",
        locations: "📍 Ubicaciones",
        filterByDevice: "Filtrar por Dispositivo:",
        allDevices: "Todos los Dispositivos",
        historyLimit: "Límite de Historial:",
        refreshData: "Actualizar Datos",
        refreshDataHistorical: "Actualizar Datos (Modo Histórico)",
        showTraceDots: "Mostrar puntos de ruta",
        loadingLocations: "Cargando ubicaciones...",
        historicalViewConfig: "📅 Configuración de Vista Histórica",
        quickRanges: ["1h", "6h", "24h", "1sem", "Todo"],
        from: "Desde:",
        to: "Hasta:",
        applyTimeFilter: "Aplicar Filtro de Tiempo",
        clearFilter: "Limpiar Filtro",
        noResultsTitle: "No se Encontraron Resultados",
        noResultsMessage: "No se encontraron datos de ubicación que coincidan con sus criterios de filtro. Intente ajustar los parámetros.",
        noLocationResultsMessage: "No se encontraron datos de ubicación dentro de {radius} km de las coordenadas seleccionadas.",
        adjustFilters: "Ajustar Filtros",
        noLocationsFound: "No se encontraron ubicaciones",
        ok: "Aceptar",
        deviceId: "ID de Dispositivo",
        coordinates: "Coordenadas",
        time: "Hora",
        start: "INICIO",
        end: "FIN",
        selected: "SELECCIONADO",
        clearSelection: "Limpiar Selección",
        noTimeFilter: "No se aplicó filtro de tiempo",
        configureInSettings: "Configurar en Ajustes de Historial",
        filterLabel: "Filtro:",
        timeFilterTabLabel: "Filtro de Tiempo",
        locationFilterTabLabel: "Filtro de Ubicación",
        latitude: "Latitud",
        longitude: "Longitud",
        radiusKm: "Radio (km)",
        applyLocationFilter: "Aplicar Filtro de Ubicación",
        validLocationRequired: "Se requiere latitud y longitud válidas",
        invalidCoordinates: "Coordenadas inválidas (lat: -90 a 90, lng: -180 a 180)",
        invalidRadius: "El radio debe ser mayor que 0",
        noFilterTitle: "⚠️ No se Aplicó Filtro de Tiempo",
        noFilterMessage: "Por favor configure un filtro de tiempo en Ajustes de Historial para ver datos históricos.",
        openHistorySettings: "Abrir Ajustes de Historial",
        dismiss: "Cerrar",
        timeFilterActive: "⏱️ Filtro de Tiempo:",
        locationFilterActive: "📍 Filtro de Ubicación:",
        latitude: "Latitud",
        longitude: "Longitud",
        radiusLabel: "Radio:",
        km: "km",
        noFilterSelected: "Ningún filtro seleccionado",
        pleaseSelectFilter: "Por favor seleccione un rango de tiempo o ubicación para ver datos históricos.",
        selectFilterTab: "Elija una pestaña arriba para configurar su filtro.",
        noFilterTitle: "⚠️ No se Aplicó Filtro",
        noFilterMessage: "Por favor configure un filtro en Ajustes de Historial para ver datos históricos.",
        selectOnMap: "Seleccionar en Mapa",
        selectLocationOnMap: "Haga clic en el mapa para seleccionar una ubicación",
        clickMapToSelect: "Haga clic en cualquier lugar del mapa para establecer la ubicación del filtro",
        cancelSelection: "Cancelar",
        locationSelected: "¡Ubicación seleccionada! Coordenadas actualizadas.",
        noFilterOpenSettings: "Abrir Ajustes de Historial",
        noFilterDismiss: "Cerrar",
        emptyResultsAdjust: "Ajustar Filtros",
        emptyResultsDismiss: "Cerrar",
        loadingLocations: "Cargando ubicaciones...",
        noLocationsFound: "No se encontraron ubicaciones",
        devices: "Dispositivos",
        noDevicesFound: "No se encontraron dispositivos",
        locationsCount: "{0} ubicaciones",
        filterDevices: "Filtrar Dispositivos",
        validationErrors: {
          required: "Se requieren hora de inicio y fin",
          invalidFormat: "Formato de fecha inválido",
          startAfterEnd: "La hora de inicio debe ser anterior a la hora de fin",
          futureEnd: "La hora de fin no puede estar en el futuro",
          rangeTooLarge: "El rango de tiempo no puede exceder 1 año",
          rangeTooSmall: "El rango de tiempo debe ser de al menos 1 minuto",
          tooFarBack: "La hora de inicio no puede ser hace más de 10 años"
        }
      }
    };
    this.currentLanguage = this.detectLanguage();

    this.config = {
      apiBaseUrl: window.location.origin,
      wsUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
      mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      defaultCenter: [-74.0060, 40.7128],
      defaultZoom: 10
    };

    this.initializeApp();
  }

  detectLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    return browserLang.startsWith('es') ? 'es' : 'en';
  }

  t(key) {
    const keys = key.split('.');
    let value = this.translations[this.currentLanguage];
    for (const k of keys) {
      value = value[k];
      if (value === undefined) return key;
    }
    return value;
  }

  setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLanguage = lang;
      this.updateUILanguage();
    }
  }

  updateUILanguage() {
    // Update header
    document.querySelector('.header h1').textContent = this.t('title');
    document.querySelector('.header p').textContent = this.t('subtitle');

    // Update buttons
    const trackBtn = document.getElementById('track-latest-btn');
    if (trackBtn) {
      trackBtn.querySelector('span:last-child').textContent =
        this.isTrackingLatest ? this.t('trackLatest') : this.t('trackingOff');
    }

    document.querySelector('#history-mode-btn span:last-child').textContent = this.t('historyMode');
    document.querySelector('#history-config-btn span:last-child').textContent = this.t('historySettings');
    document.querySelector('#live-mode-btn span:last-child').textContent = this.t('liveMode');
    document.querySelector('#menu-toggle-btn span:last-child').textContent = this.t('menu');

    // Update mode indicator
    const modeIndicator = document.getElementById('mode-indicator');
    if (this.isHistoryMode) {
      modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.t('historyModeBadge')}</span>`;
    } else {
      modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.t('liveModeBadge')}</span>`;
    }

    // Update popup menu
    document.querySelector('#popup-menu .popup-header h2').textContent = this.t('controlsAndInfo');
    document.querySelector('[data-tab="controls"]').textContent = this.t('controls');
    document.querySelector('[data-tab="locations"]').textContent = this.t('locations');

    // Update controls tab
    const historyLimitLabel = document.querySelector('label[for="history-limit"]');
    if (historyLimitLabel) {
      historyLimitLabel.textContent = this.t('historyLimit');
    }

    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
      refreshBtn.textContent = this.isHistoryMode ? this.t('refreshDataHistorical') : this.t('refreshData');
    }

    const traceDotsLabel = document.getElementById('trace-dots-label');
    if (traceDotsLabel) {
      traceDotsLabel.textContent = this.t('showTraceDots');
    }
    // Update history config popup
    document.querySelector('#history-config-popup .popup-header h2').textContent = this.t('historicalViewConfig');
    document.querySelector('label[for="start-time-popup"]').textContent = this.t('from');
    document.querySelector('label[for="end-time-popup"]').textContent = this.t('to');
    document.getElementById('apply-time-filter-popup').textContent = this.t('applyTimeFilter');
    document.getElementById('clear-time-filter-popup').textContent = this.t('clearFilter');

    // Update no filter overlay
    const noFilterTitle = document.getElementById('no-filter-title');
    const noFilterMessage = document.getElementById('no-filter-message');
    const noFilterBtnText = document.getElementById('no-filter-btn-text');
    const noFilterDismissText = document.getElementById('no-filter-dismiss-text');

    if (noFilterTitle) noFilterTitle.textContent = this.t('noFilterTitle');
    if (noFilterMessage) noFilterMessage.textContent = this.t('noFilterMessage');
    if (noFilterBtnText) noFilterBtnText.textContent = this.t('noFilterOpenSettings');
    if (noFilterDismissText) noFilterDismissText.textContent = this.t('noFilterDismiss');

    // Update no filter selected message
    const noFilterSelectedTitle = document.getElementById('no-filter-selected-title');
    const pleaseSelectFilter = document.getElementById('please-select-filter');
    const selectFilterTab = document.getElementById('select-filter-tab');

    if (noFilterSelectedTitle) noFilterSelectedTitle.textContent = this.t('noFilterSelected');
    if (pleaseSelectFilter) pleaseSelectFilter.textContent = this.t('pleaseSelectFilter');
    if (selectFilterTab) selectFilterTab.textContent = this.t('selectFilterTab');


    // Update empty results popup
    const emptyResultsTitle = document.getElementById('empty-results-title');
    const emptyResultsMessage = document.getElementById('empty-results-message');
    const emptyResultsAdjustBtn = document.getElementById('empty-results-adjust-btn');
    const emptyResultsDismissBtn = document.getElementById('empty-results-dismiss-btn');

    if (emptyResultsTitle) emptyResultsTitle.textContent = '⚠️ ' + this.t('noResultsTitle');
    if (emptyResultsMessage) emptyResultsMessage.textContent = this.t('noResultsMessage');
    if (emptyResultsAdjustBtn) emptyResultsAdjustBtn.textContent = this.t('adjustFilters');
    if (emptyResultsDismissBtn) emptyResultsDismissBtn.textContent = this.t('dismiss');

    // Update route legend
    const legendStart = document.getElementById('legend-start');
    const legendEnd = document.getElementById('legend-end');
    if (legendStart) legendStart.textContent = this.t('legendStart');
    if (legendEnd) legendEnd.textContent = this.t('legendEnd');

    // Update device legend title
    const deviceLegendTitle = document.querySelector('#device-legend h4');
    if (deviceLegendTitle) {
      const countSpan = deviceLegendTitle.querySelector('#device-count');
      // Preserve the span, just change the text
      deviceLegendTitle.innerHTML = `📱 ${this.t('devices')} ${countSpan ? countSpan.outerHTML : ''}`;
    }
    // Update device filter title in popup
    const filterDevicesTitle = document.querySelector('#controls-tab .device-filter-section h4');
    if (filterDevicesTitle) {
      filterDevicesTitle.innerHTML = `📱 ${this.t('filterDevices')}`;
    }
    // Update history config popup tabs
    const timeFilterTabBtn = document.querySelector('#time-filter-tab-label');
    const locationFilterTabBtn = document.querySelector('#location-filter-tab-label');
    if (timeFilterTabBtn) timeFilterTabBtn.textContent = this.t('timeFilterTabLabel');
    if (locationFilterTabBtn) locationFilterTabBtn.textContent = this.t('locationFilterTabLabel');

    // Update location filter labels
    const locationLatLabel = document.getElementById('location-lat-label');
    const locationLngLabel = document.getElementById('location-lng-label');
    const locationRadiusLabel = document.getElementById('location-radius-label');
    const applyLocationBtn = document.getElementById('apply-location-filter');
    const clearLocationBtn = document.getElementById('clear-location-filter');

    if (locationLatLabel) locationLatLabel.textContent = this.t('latitude');
    if (locationLngLabel) locationLngLabel.textContent = this.t('longitude');
    if (locationRadiusLabel) locationRadiusLabel.textContent = this.t('radiusKm');
    if (applyLocationBtn) applyLocationBtn.textContent = this.t('applyLocationFilter');
    if (clearLocationBtn) clearLocationBtn.textContent = this.t('clearFilter');

    // Update select on map button
    const selectOnMapText = document.getElementById('select-on-map-text');
    if (selectOnMapText) selectOnMapText.textContent = '📍 ' + this.t('selectOnMap');

    // Refresh displays
    this.updateConnectionStatus(
      this.ws && this.ws.readyState === WebSocket.OPEN ? this.t('connected') : this.t('connecting'),
      this.ws && this.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected'
    );
    this.updateTimeFilterIndicator();
    this.displayLocations();
    // Refresh dynamic device lists that contain translated text
    this.updateDeviceLegend();
    this.updateDeviceFilterList();
  }

  async initializeApp() {
    try {
      this.initializeMap();
      this.setupEventListeners();
      this.setupPopupMenu();
      this.setupOverlayEventListeners();
      await this.loadDevices();
      await this.loadInitialData();
      this.connectWebSocket();
      this.startStatsPolling();
      this.initializeTimePickers();
      this.updateRefreshButtonState();
      this.updateTimeFilterIndicator();
      this.updateUILanguage();
      document.getElementById('language-selector').value = this.currentLanguage;
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Failed to initialize application');
    }
  }
  setupOverlayEventListeners() {
    // No filter overlay buttons
    const noFilterOpenBtn = document.getElementById('no-filter-open-settings-btn');
    const noFilterDismissBtn = document.getElementById('no-filter-dismiss-btn');

    if (noFilterOpenBtn) {
      noFilterOpenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideNoFilterOverlay();
        this.openHistoryConfigPopup();
      });
    }

    if (noFilterDismissBtn) {
      noFilterDismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideNoFilterOverlay();
      });
    }

    // Empty results overlay buttons
    const emptyResultsAdjustBtn = document.getElementById('empty-results-adjust-btn-element');
    const emptyResultsDismissBtn = document.getElementById('empty-results-dismiss-btn-element');

    if (emptyResultsAdjustBtn) {
      emptyResultsAdjustBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideNoResultsOverlay()
        this.openHistoryConfigPopup();
      });
    }

    if (emptyResultsDismissBtn) {
      emptyResultsDismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideNoResultsOverlay()
      });
    }

    // Prevent clicks inside overlays from closing them
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

  initializeMap() {
    this.map = new maplibregl.Map({
      container: 'map',
      style: this.config.mapStyle,
      center: this.config.defaultCenter,
      zoom: this.config.defaultZoom,
      attributionControl: true
    });

    this.map.addControl(new maplibregl.NavigationControl(), 'bottom-left');
    this.map.addControl(new maplibregl.FullscreenControl(), 'bottom-left');

    this.map.on('dragstart', () => {
      if (!this.suppressUserInteraction) this.handleUserInteraction();
    });

    this.map.on('zoomstart', () => {
      if (!this.suppressUserInteraction) this.handleUserInteraction();
    });

    this.map.on('movestart', () => {
      if (!this.suppressUserInteraction) this.handleUserInteraction();
    });

    this.map.on('load', () => {
      this.initializeRouteLine();
      this.routeCoords = this.locations.map(loc => [loc.longitude, loc.latitude]);
      this.updateRouteLine();
      console.log('Map loaded successfully');
    });

    this.map.on('error', (e) => {
      console.error('Map error:', e);
    });
  }

  setupPopupMenu() {
    const menuToggle = document.getElementById('menu-toggle-btn');
    const popupMenu = document.getElementById('popup-menu');
    const popupClose = document.getElementById('popup-close');

    // History config popup elements
    const historyConfigPopup = document.getElementById('history-config-popup');
    const historyConfigClose = document.getElementById('history-config-close');

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Toggle main menu
    menuToggle.addEventListener('click', () => {
      popupMenu.classList.add('active');
    });

    // Close main menu
    const closeMenu = () => {
      popupMenu.classList.remove('active');
    };

    // Close history config popup
    const closeHistoryConfig = () => {
      historyConfigPopup.classList.remove('active');
    };

    popupClose.addEventListener('click', closeMenu);
    historyConfigClose.addEventListener('click', closeHistoryConfig);

    // ✅ FIX: Stop event propagation when clicking inside popup content
    popupMenu.querySelector('.popup-content').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    historyConfigPopup.querySelector('.popup-content').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Close when clicking outside content (background only)
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

    // Tab switching
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset.tab;

        // Update button states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Update content visibility
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === `${tabId}-tab`) {
            content.classList.add('active');
          }
        });
      });
    });

    // Close menus with Escape key
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

  handleUserInteraction() {
    // ignore programmatic moves
    if (this.suppressUserInteraction) return;

    if (!this.userInteracted) {
      this.userInteracted = true;
      if (this.isTrackingLatest) {
        this.toggleTracking(false);
      }
    }
  }

  initializeRouteLine() {
    // Remove existing route layers and source
    if (this.map.getSource('route')) {
      if (this.map.getLayer('route-line')) {
        this.map.removeLayer('route-line');
      }
      this.map.removeSource('route');
    }

    // Remove any existing segment layers
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

    const coordinates = this.routeCoords;

    if (coordinates.length < 2) {
      // Remove all segment layers
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

    // Create colored segments
    const features = [];
    const totalSegments = coordinates.length - 1;

    // NOTE: coordinates array is ordered from NEWEST to OLDEST (index 0 = newest, last index = oldest)
    // We want: oldest (last index) = GREEN, newest (index 0) = RED

    for (let i = 0; i < totalSegments; i++) {
      // Calculate progress: 0 = oldest (green), 1 = newest (red)
      // Since array is reversed (newest first), we need to invert the progress
      const progress = 1 - (i / totalSegments);

      // Calculate color based on progress
      // progress = 0 (oldest) -> Green #10b981
      // progress = 0.5 (middle) -> Orange #f59e0b  
      // progress = 1 (newest) -> Red #ef4444
      let color;
      if (progress < 0.5) {
        // Green to Orange (oldest to middle)
        const localProgress = progress * 2;
        const r = Math.round(16 + (245 - 16) * localProgress);
        const g = Math.round(185 - (185 - 158) * localProgress);
        const b = Math.round(129 - (129 - 11) * localProgress);
        color = `rgb(${r}, ${g}, ${b})`;
      } else {
        // Orange to Red (middle to newest)
        const localProgress = (progress - 0.5) * 2;
        const r = Math.round(245 + (239 - 245) * localProgress);
        const g = Math.round(158 - (158 - 68) * localProgress);
        const b = Math.round(11 + (68 - 11) * localProgress);
        color = `rgb(${r}, ${g}, ${b})`;
      }

      features.push({
        type: 'Feature',
        properties: {
          color: color,
          segmentIndex: i
        },
        geometry: {
          type: 'LineString',
          coordinates: [coordinates[i], coordinates[i + 1]]
        }
      });
    }

    // Remove existing segment layers
    for (let i = 0; i < 100; i++) {
      if (this.map.getLayer(`route-segment-${i}`)) {
        this.map.removeLayer(`route-segment-${i}`);
      }
    }

    // Update source data
    this.map.getSource('route').setData({
      type: 'FeatureCollection',
      features: features
    });

    // Add layers for each segment with its specific color
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

    if (this.routeCoords.length > 1) {
      legend.style.display = 'block';
    } else {
      legend.style.display = 'none';
    }
  }

  createTraceMarker(location, isStart = false, isEnd = false, progress = 0.5) {
    const deviceInfo = this.devices.get(location.device_id);
    const deviceColor = deviceInfo ? deviceInfo.color : '#3b82f6';

    const popupContent = `
      <div style="font-family: system-ui; min-width: 200px;">
        <h4 style="margin: 0 0 10px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${deviceColor};"></div>
          ${location.device_id}
          ${isStart ? ` <span style="color: #10b981; font-size: 12px;">(${this.t('start')})</span>` : ''}
          ${isEnd ? ` <span style="color: #ef4444; font-size: 12px;">(${this.t('end')})</span>` : ''}
        </h4>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
          <strong>${this.t('coordinates')}:</strong><br>
          ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          <strong>${this.t('time')}:</strong><br>
          ${new Date(location.timestamp).toLocaleString()}
        </div>
      </div>
    `;

    const el = document.createElement('div');
    el.className = 'trace-marker';

    // Apply visibility based on showTraceDots setting
    if (this.showTraceDots) {
      el.classList.add('always-visible');
    }

    if (isStart) {
      el.classList.add('start-point');
      el.style.backgroundColor = deviceColor;
      el.style.borderColor = '#10b981'; // Green border for start
    } else if (isEnd) {
      el.classList.add('end-point');
      el.style.backgroundColor = deviceColor;
      el.style.borderColor = '#ef4444'; // Red border for end
    } else {
      // Regular trace point - use device color with gradient halo
      el.style.backgroundColor = deviceColor;

      // Calculate gradient color for halo (green -> yellow -> red)
      let haloColor;
      if (progress < 0.5) {
        // Green to Yellow (oldest to middle)
        const localProgress = progress * 2;
        const r = Math.round(16 + (245 - 16) * localProgress);
        const g = Math.round(185 - (185 - 158) * localProgress);
        const b = Math.round(129 - (129 - 11) * localProgress);
        haloColor = `rgb(${r}, ${g}, ${b})`;
      } else {
        // Yellow to Red (middle to newest)
        const localProgress = (progress - 0.5) * 2;
        const r = Math.round(245 + (239 - 245) * localProgress);
        const g = Math.round(158 - (158 - 68) * localProgress);
        const b = Math.round(11 + (68 - 11) * localProgress);
        haloColor = `rgb(${r}, ${g}, ${b})`;
      }

      el.style.borderColor = haloColor;
    }

    // CRITICAL FIX: Use correct coordinate order [longitude, latitude]
    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'center' // Ensure marker is centered on coordinates
    })
      .setLngLat([location.longitude, location.latitude]) // longitude first, then latitude
      .setPopup(new maplibregl.Popup({
        offset: 15,
        closeButton: false
      }).setHTML(popupContent))
      .addTo(this.map);

    this.traceMarkers.push(marker);
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;

    return bearing;
  }

  clearTraceMarkers() {
    this.traceMarkers.forEach(m => m.remove());
    this.traceMarkers = [];
  }


  initializeTimePickers() {
    const now = new Date();
    const endTime = new Date(now);
    const startTime = new Date(now - 24 * 60 * 60 * 1000); // 24 hours ago

    document.getElementById('end-time-popup').value = this.formatDateTimeLocal(endTime);
    document.getElementById('start-time-popup').value = this.formatDateTimeLocal(startTime);
  }

  formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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

      // Center on all visible devices
      this.centerMapOnDevices();
    } else {
      btn.classList.remove('enabled');
      btn.classList.add('disabled');
      btn.querySelector('span:last-child').textContent = this.t('trackingOff');
    }
  }

  toggleHistoryMode() {
    this.isHistoryMode = !this.isHistoryMode;
    const historyBtn = document.getElementById('history-mode-btn');
    const historyConfigBtn = document.getElementById('history-config-btn');
    const liveModeBtn = document.getElementById('live-mode-btn');
    const trackBtn = document.getElementById('track-latest-btn');
    const modeIndicator = document.getElementById('mode-indicator');

    // Clear any selected location markers when switching modes
    this.clearSelectedLocationMarker();
    this.selectedLocationIndex = -1;

    if (this.isHistoryMode) {
      // Update mode indicator
      modeIndicator.className = 'mode-indicator history-mode';
      modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.t('historyModeBadge')}</span>`;

      // Hide history mode button, show config and live mode buttons
      historyBtn.style.display = 'none';
      historyConfigBtn.style.display = 'flex';
      liveModeBtn.style.display = 'flex';
      trackBtn.style.display = 'none';

      this.toggleTracking(false);

      // CRITICAL FIX: Clear everything when entering history mode
      this.clearAllMarkers();
      this.clearTraceMarkers();
      this.clearAllRoutes(); // Clear all routes
      this.routeCoords = [];
      this.updateRouteLine();

      // Check if we have any persisted filters
      const hasPersistedTimeFilter = this.persistedTimeFilter !== null;
      const hasPersistedLocationFilter = this.persistedLocationFilter !== null;

      if (hasPersistedTimeFilter) {
        // Restore time filter
        this.timeFilter = {...this.persistedTimeFilter};
        this.activeFilterType = 'time';
        this.locationFilter = null;
        this.restoreTimePickerValues();
        this.updateTimeFilterIndicator();
        this.loadHistoricalData();
        this.hideNoFilterOverlay();
      } else if (hasPersistedLocationFilter) {
        // Restore location filter
        this.locationFilter = {...this.persistedLocationFilter};
        this.activeFilterType = 'location';
        this.timeFilter = null;
        this.updateTimeFilterIndicator();
        this.loadHistoricalByLocation(
          this.locationFilter.lat,
          this.locationFilter.lng,
          this.locationFilter.radius
        );
        this.hideNoFilterOverlay();
      } else {
        // No persisted filters - show empty state
        this.filteredLocations = [];
        this.activeFilterType = null;
        this.locationFilter = null;
        this.timeFilter = null;
        this.displayFilteredLocations();
        this.updateTimeFilterIndicator();

        setTimeout(() => {
          this.showNoFilterOverlay();
        }, 100);
      }

    } else {
      // Update mode indicator
      modeIndicator.className = 'mode-indicator live-mode';
      modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.t('liveModeBadge')}</span>`;

      // Store current filters before leaving history mode
      if (this.timeFilter && this.activeFilterType === 'time') {
        this.persistedTimeFilter = {...this.timeFilter};
        this.persistedLocationFilter = null;
      } else if (this.locationFilter && this.activeFilterType === 'location') {
        this.persistedLocationFilter = {...this.locationFilter};
        this.persistedTimeFilter = null;
      }

      // Show history mode button, hide config and live mode buttons
      historyBtn.style.display = 'flex';
      historyConfigBtn.style.display = 'none';
      liveModeBtn.style.display = 'none';
      trackBtn.style.display = 'flex';

      // CRITICAL FIX: Clear everything when leaving history mode
      this.clearAllMarkers();
      this.clearTraceMarkers();
      this.clearAllRoutes(); // Clear all routes
      this.filteredLocations = [];
      this.updateTimeFilterIndicator();

      // Reset live mode: fetch latest from DB and prepare for live updates
      this.loadInitialData();

      // Process any queued live updates
      while (this.liveUpdateQueue.length > 0) {
        const queuedLocation = this.liveUpdateQueue.shift();
        this.applyLocationUpdate(queuedLocation);
      }
    }

    // Update refresh button state based on current mode
    this.updateRefreshButtonState();
    this.updateLocationSelection();
    this.hideNoFilterOverlay();

    // Re-apply translations after mode switch
    this.updateUILanguage();
  }

  showNoFilterOverlay() {
    console.log('showNoFilterOverlay called');
    const overlay = document.getElementById('no-filter-overlay');
    if (overlay) {
      console.log('Overlay found, adding show class');

      // Force reflow to ensure display change is registered
      overlay.style.display = 'none';
      overlay.offsetHeight; // Force reflow
      overlay.style.display = 'block';

      // Add show class after a tiny delay
      requestAnimationFrame(() => {
        overlay.classList.add('show');
      });
    } else {
      console.error('no-filter-overlay element not found!');
    }
  }

  hideNoFilterOverlay() {
    console.log('hideNoFilterOverlay called'); // Debug log
    const overlay = document.getElementById('no-filter-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
  }

  hideNoResultsOverlay() {
    console.log('hideNoResultsOverlay called'); // Debug log
    const overlay = document.getElementById('no-results-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
  }

  setupEventListeners() {
    // Track Latest button
    document.getElementById('track-latest-btn').addEventListener('click', () => {
      this.userInteracted = false;
      this.suppressUserInteraction = false;
      this.selectedLocationIndex = -1;
      this.toggleTracking(true);
      this.updateLocationSelection();
    });

    // History Mode button
    document.getElementById('history-mode-btn').addEventListener('click', () => {
      this.toggleHistoryMode();
    });

    // Live Mode button (appears in history mode)
    document.getElementById('live-mode-btn').addEventListener('click', () => {
      this.toggleHistoryMode();
    });

    // History Config button
    document.getElementById('history-config-btn').addEventListener('click', () => {
      this.openHistoryConfigPopup();
    });

    document.getElementById('toggle-trace-dots').addEventListener('change', (e) => {
      this.showTraceDots = e.target.checked;
      this.applyTraceDotsVisibility();
    });

    // History limit
    document.getElementById('history-limit').addEventListener('change', (e) => {
      this.historyLimit = parseInt(e.target.value);
      this.refreshData();
    });

    document.getElementById('language-selector').addEventListener('change', (e) => {
      this.setLanguage(e.target.value);
    });

    // Refresh on window focus
    window.addEventListener('focus', () => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        this.connectWebSocket();
      }
    });
  }
  updateRefreshButtonState() {
    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
      if (this.isHistoryMode) {
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
  applyTraceDotsVisibility() {
    this.traceMarkers.forEach(marker => {
      const el = marker.getElement();
      if (this.showTraceDots) {
        el.classList.add('always-visible');
      } else {
        el.classList.remove('always-visible');
      }
    });

    document.getElementById('toggle-trace-dots').checked = this.showTraceDots;
  }

  openHistoryConfigPopup() {
    console.log('Opening history config popup');

    const historyConfigPopup = document.getElementById('history-config-popup');
    if (!historyConfigPopup) {
      console.error('History config popup not found');
      return;
    }

    const closeBtn = historyConfigPopup.querySelector('#history-config-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        historyConfigPopup.classList.remove('active');
      };
    }

    // Get tab elements
    const timeFilterTab = document.getElementById('time-filter-tab');
    const locationFilterTab = document.getElementById('location-filter-tab');
    const noFilterTab = document.getElementById('no-filter-selected-tab');
    const tabButtons = historyConfigPopup.querySelectorAll('.tab-button');

    // Hide all tabs and remove active classes first
    if (timeFilterTab) timeFilterTab.classList.remove('active');
    if (locationFilterTab) locationFilterTab.classList.remove('active');
    if (noFilterTab) noFilterTab.style.display = 'none';
    tabButtons.forEach(btn => btn.classList.remove('active'));

    // Preserve input values for location filter (don't reset them)
    const latInput = document.getElementById('location-lat-input');
    const lngInput = document.getElementById('location-lng-input');
    const radiusInput = document.getElementById('location-radius-input');

    // Only populate if there's an active location filter, otherwise keep current values
    if (this.activeFilterType === 'location' && this.locationFilter) {
      latInput.value = this.locationFilter.lat;
      lngInput.value = this.locationFilter.lng;
      radiusInput.value = this.locationFilter.radius;
    }
    // If no active filter but inputs are empty, set default radius
    if (!latInput.value && !lngInput.value && !radiusInput.value) {
      radiusInput.value = '0.5';
    }

    // Determine which tab to show
    let tabToShow = null;

    if (this.activeFilterType === 'time' && this.timeFilter) {
      // Show time filter tab and populate values
      tabToShow = 'time-filter';
      this.lastActiveConfigTab = 'time-filter';
      document.getElementById('start-time-popup').value = this.formatDateTimeLocal(this.timeFilter.start);
      document.getElementById('end-time-popup').value = this.formatDateTimeLocal(this.timeFilter.end);
    } else if (this.activeFilterType === 'location' && this.locationFilter) {
      // Show location filter tab (values already populated above)
      tabToShow = 'location-filter';
      this.lastActiveConfigTab = 'location-filter';
    } else {
      // No active filter - show last active tab or default to time filter
      if (this.lastActiveConfigTab && (this.lastActiveConfigTab === 'time-filter' || this.lastActiveConfigTab === 'location-filter')) {
        tabToShow = this.lastActiveConfigTab;
      } else {
        // Show no filter tab as default
        if (noFilterTab) {
          noFilterTab.classList.add('active');
          noFilterTab.style.display = 'block';
        }
        // Activate time filter tab button by default
        document.getElementById('time-filter-tab-btn').classList.add('active');
        tabToShow = null; // Don't show any specific tab, show no-filter message
      }
    }

    // Show the appropriate tab
    if (tabToShow === 'time-filter') {
      if (timeFilterTab) timeFilterTab.classList.add('active');
      document.getElementById('time-filter-tab-btn').classList.add('active');
    } else if (tabToShow === 'location-filter') {
      if (locationFilterTab) locationFilterTab.classList.add('active');
      document.getElementById('location-filter-tab-btn').classList.add('active');
    }

    // Show popup
    historyConfigPopup.classList.add('active');

    console.log('Popup shown, setting up events');

    // Set up events
    this.setupConfigPopupEvents(historyConfigPopup);
  }

  setupConfigPopupEvents(popup) {
    console.log('Setting up config popup events'); // Debug log

    // === TIME FILTER TAB SETUP ===
    const controlsContainer = popup.querySelector('#historical-controls-popup');
    if (controlsContainer) {
      console.log('Time filter controls found'); // Debug log

      const startInput = popup.querySelector('#start-time-popup');
      const endInput = popup.querySelector('#end-time-popup');
      const applyBtn = popup.querySelector('#apply-time-filter-popup');
      const clearBtn = popup.querySelector('#clear-time-filter-popup');

      // Remove old listeners by cloning
      if (applyBtn) {
        const newApplyBtn = applyBtn.cloneNode(true);
        applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);

        newApplyBtn.addEventListener('click', () => {
          console.log('Apply time filter clicked');
          if (this.validateTimeFilter()) {
            this.applyTimeFilterFromPopup();
          }
        });
      }

      if (clearBtn) {
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);

        newClearBtn.addEventListener('click', () => {
          console.log('Clear time filter clicked');
          this.clearTimeFilter();
        });
      }

      if (startInput && endInput) {
        const validateAndUpdate = () => {
          this.validateTimeFilter();
        };

        startInput.addEventListener('change', validateAndUpdate);
        endInput.addEventListener('change', validateAndUpdate);
        startInput.addEventListener('input', validateAndUpdate);
        endInput.addEventListener('input', validateAndUpdate);
      }

      controlsContainer.querySelectorAll('.quick-range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const hours = parseInt(e.target.dataset.hours);
          this.setQuickTimeRange(hours);
          controlsContainer.querySelectorAll('.quick-range-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          setTimeout(() => this.validateTimeFilter(), 100);
        });
      });

      setTimeout(() => this.validateTimeFilter(), 200);
    } else {
      console.error('Time filter controls container not found!');
    }

    // === TAB SWITCHING SETUP ===
    const tabButtons = popup.querySelectorAll('.tab-button');
    const tabContents = popup.querySelectorAll('.tab-content');

    console.log('Found tab buttons:', tabButtons.length); // Debug log
    console.log('Found tab contents:', tabContents.length); // Debug log

    tabButtons.forEach(button => {
      // Remove old listeners by cloning
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);

      newButton.addEventListener('click', () => {
        const tabId = newButton.dataset.tab;
        console.log('Tab clicked:', tabId); // Debug log

        // Update last active tab
        this.lastActiveConfigTab = tabId;

        // Update button states
        popup.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        newButton.classList.add('active');

        // Hide ALL tabs including no-filter-selected-tab
        const noFilterTab = popup.querySelector('#no-filter-selected-tab');
        const timeFilterTab = popup.querySelector('#time-filter-tab');
        const locationFilterTab = popup.querySelector('#location-filter-tab');

        // Remove active class and hide all tabs
        if (noFilterTab) {
          noFilterTab.classList.remove('active');
          noFilterTab.style.display = 'none';
        }
        if (timeFilterTab) timeFilterTab.classList.remove('active');
        if (locationFilterTab) locationFilterTab.classList.remove('active');

        // Show the selected tab
        if (tabId === 'time-filter' && timeFilterTab) {
          timeFilterTab.classList.add('active');
          console.log('Activated tab: time-filter-tab');
        } else if (tabId === 'location-filter' && locationFilterTab) {
          locationFilterTab.classList.add('active');
          console.log('Activated tab: location-filter-tab');
        }
      });
    });

    // === LOCATION FILTER TAB SETUP ===
    const locationTab = popup.querySelector('#location-filter-tab');
    console.log('Location filter tab found:', !!locationTab); // Debug log

    if (locationTab) {
      const latInput = locationTab.querySelector('#location-lat-input');
      const lngInput = locationTab.querySelector('#location-lng-input');
      const radiusInput = locationTab.querySelector('#location-radius-input');
      let applyLocationBtn = locationTab.querySelector('#apply-location-filter'); // Use let so we can update the reference
      const clearLocationBtn = locationTab.querySelector('#clear-location-filter');
      const errorElement = locationTab.querySelector('#location-validation-error');

      console.log('Location filter elements:', {
        latInput: !!latInput,
        lngInput: !!lngInput,
        radiusInput: !!radiusInput,
        applyLocationBtn: !!applyLocationBtn,
        clearLocationBtn: !!clearLocationBtn,
        errorElement: !!errorElement
      }); // Debug log

      // Validation function for location filter
      const validateLocationFilter = () => {
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);
        const radius = parseFloat(radiusInput.value);

        // Clear previous errors
        this.clearValidationError(applyLocationBtn, errorElement);

        // Check if inputs are empty (valid state - user hasn't entered anything yet)
        if (latInput.value === '' || lngInput.value === '') {
          applyLocationBtn.disabled = true;
          return false;
        }

        // Check for invalid numbers
        if (isNaN(lat) || isNaN(lng)) {
          this.showValidationError('validLocationRequired', applyLocationBtn, errorElement);
          return false;
        }

        // Check coordinate ranges
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          this.showValidationError('invalidCoordinates', applyLocationBtn, errorElement);
          return false;
        }

        // Check radius
        if (isNaN(radius) || radius <= 0) {
          this.showValidationError('invalidRadius', applyLocationBtn, errorElement);
          return false;
        }

        // All validations passed
        applyLocationBtn.disabled = false;
        return true;
      };

      // Add input event listeners for real-time validation
      if (latInput) {
        latInput.addEventListener('input', validateLocationFilter);
        latInput.addEventListener('change', validateLocationFilter);
      }
      if (lngInput) {
        lngInput.addEventListener('input', validateLocationFilter);
        lngInput.addEventListener('change', validateLocationFilter);
      }
      if (radiusInput) {
        radiusInput.addEventListener('input', validateLocationFilter);
        radiusInput.addEventListener('change', validateLocationFilter);
      }

      if (applyLocationBtn) {
        // Remove old listener by cloning
        const newApplyLocationBtn = applyLocationBtn.cloneNode(true);
        applyLocationBtn.parentNode.replaceChild(newApplyLocationBtn, applyLocationBtn);
        applyLocationBtn = newApplyLocationBtn; // Update reference

        newApplyLocationBtn.addEventListener('click', () => {
          console.log('Apply location filter clicked');

          const lat = parseFloat(latInput.value);
          const lng = parseFloat(lngInput.value);
          const radius = parseFloat(radiusInput.value);

          console.log('Location filter values:', {lat, lng, radius});

          if (isNaN(lat) || isNaN(lng)) {
            console.log('Invalid lat/lng');
            this.showValidationError('validLocationRequired', newApplyLocationBtn, errorElement);
            return;
          }

          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.log('Coordinates out of range');
            this.showValidationError('invalidCoordinates', newApplyLocationBtn, errorElement);
            return;
          }

          if (isNaN(radius) || radius <= 0) {
            console.log('Invalid radius');
            this.showValidationError('invalidRadius', newApplyLocationBtn, errorElement);
            return;
          }

          console.log('Validation passed, loading historical by location');
          this.clearValidationError(newApplyLocationBtn, errorElement);

          // Clear time filter inputs when applying location filter
          document.getElementById('start-time-popup').value = '';
          document.getElementById('end-time-popup').value = '';
          document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));
          // Clear any previous location filter marker or overlay
          this.clearSelectedLocationMarker();
          this.clearAllMarkers();
          this.clearTraceMarkers();
          this.loadHistoricalByLocation(lat, lng, radius);
          popup.classList.remove('active');
        });
      } else {
        console.error('Apply location button not found!');
      }

      if (clearLocationBtn) {
        // Remove old listener by cloning
        const newClearLocationBtn = clearLocationBtn.cloneNode(true);
        clearLocationBtn.parentNode.replaceChild(newClearLocationBtn, clearLocationBtn);

        newClearLocationBtn.addEventListener('click', () => {
          console.log('Clear location filter clicked');

          latInput.value = '';
          lngInput.value = '';
          radiusInput.value = '0.5';

          // Get the apply button reference and clear validation
          const currentApplyBtn = locationTab.querySelector('#apply-location-filter');
          this.clearValidationError(currentApplyBtn, errorElement);
          if (currentApplyBtn) currentApplyBtn.disabled = true; // Disable since inputs are now empty

          // Clear both filter states
          this.locationFilter = null;
          this.timeFilter = null;
          this.persistedTimeFilter = null;
          this.persistedLocationFilter = null;
          this.activeFilterType = null;
          this.filteredLocations = [];
          this.clearAllMarkers();
          this.clearTraceMarkers();
          this.routeCoords = [];
          this.updateRouteLine();
          this.displayFilteredLocations();
          this.updateTimeFilterIndicator();

          setTimeout(() => {
            this.showNoFilterOverlay();
          }, 100);
        });
      }

      // Set initial validation state
      setTimeout(() => validateLocationFilter(), 100);
    } else {
      console.error('Location filter tab not found!');
    }

    // === SELECT ON MAP BUTTON SETUP ===
    const selectOnMapBtn = popup.querySelector('#select-on-map-btn');
    if (selectOnMapBtn) {
      // Remove old listener by cloning
      const newSelectOnMapBtn = selectOnMapBtn.cloneNode(true);
      selectOnMapBtn.parentNode.replaceChild(newSelectOnMapBtn, selectOnMapBtn);

      newSelectOnMapBtn.addEventListener('click', () => {
        console.log('Select on map button clicked');

        // Close the popup
        popup.classList.remove('active');

        // Start map selection
        this.startMapLocationSelection();
      });
    }
  }
  // Add this method after setupConfigPopupEvents
  restoreTimePickerValues() {
    if (this.persistedTimeFilter) {
      document.getElementById('start-time-popup').value = this.formatDateTimeLocal(this.persistedTimeFilter.start);
      document.getElementById('end-time-popup').value = this.formatDateTimeLocal(this.persistedTimeFilter.end);
      this.updateTimeFilterIndicator(); // Add this line
    }
  }

  validateTimeFilter() {
    const startInput = document.getElementById('start-time-popup');
    const endInput = document.getElementById('end-time-popup');
    const errorElement = document.getElementById('validation-error');
    const applyBtn = document.getElementById('apply-time-filter-popup');

    if (!startInput || !endInput) return false;

    const startValue = startInput.value;
    const endValue = endInput.value;

    if (!startValue || !endValue) {
      this.showValidationError('Both start and end times are required', applyBtn, errorElement);
      return false;
    }

    const startTime = new Date(startValue);
    const endTime = new Date(endValue);
    const now = new Date();

    // Check if dates are valid
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      this.showValidationError('Invalid date format', applyBtn, errorElement);
      return false;
    }

    // Check if start is after end
    if (startTime >= endTime) {
      this.showValidationError('Start time must be before end time', applyBtn, errorElement);
      return false;
    }

    // Check if end time is in the future (with 1 minute tolerance)
    if (endTime > new Date(now.getTime() + 60000)) {
      this.showValidationError('End time cannot be in the future', applyBtn, errorElement);
      return false;
    }

    // Check if time range is too large (more than 1 year)
    const maxDuration = 365 * 24 * 60 * 60 * 1000;
    if (endTime.getTime() - startTime.getTime() > maxDuration) {
      this.showValidationError('Time range cannot exceed 1 year', applyBtn, errorElement);
      return false;
    }

    // Check if time range is too small (less than 1 minute)
    const minDuration = 60 * 1000;
    if (endTime.getTime() - startTime.getTime() < minDuration) {
      this.showValidationError('Time range must be at least 1 minute', applyBtn, errorElement);
      return false;
    }

    // Check if start time is too far in the past (more than 10 years)
    const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    if (startTime < tenYearsAgo) {
      this.showValidationError('Start time cannot be more than 10 years ago', applyBtn, errorElement);
      return false;
    }

    // All validations passed
    this.clearValidationError(applyBtn, errorElement);
    return true;
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

  showValidationError(message, button, errorElement) {
    // Translate validation error if it's a key
    let translatedMessage = message;

    // Check if it's a validation error key
    if (message === 'validLocationRequired' || message === 'invalidCoordinates' || message === 'invalidRadius') {
      translatedMessage = this.t(message);
    } else {
      // Check if it's in validationErrors object
      const validationKey = `validationErrors.${message}`;
      const translated = this.t(validationKey);
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

  showEmptyResultsPopup() {
    document.getElementById('no-results-overlay').classList.add('show');
  }

  showEmptyResultsPopup(isLocationFilter = false, radius = 0) {
    console.log('showEmptyResultsPopup called with:', {isLocationFilter, radius});

    const emptyPopup = document.getElementById('no-results-overlay');
    if (!emptyPopup) {
      console.error('Empty results popup not found!');
      return;
    }

    // Update the message based on filter type
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

    // Force show the popup
    emptyPopup.style.display = 'block';
    emptyPopup.classList.add('show');

    console.log('Empty results popup should now be visible');
  }

  hideEmptyResultsPopup() {
    const emptyPopup = document.getElementById('empty-results-popup');
    if (!emptyPopup) {
      console.error('Empty results popup not found!');
      return;
    }

    emptyPopup.classList.remove('show');
    emptyPopup.style.display = 'none';
    console.log('Empty results popup hidden');
  }

  closeEmptyResultsPopup() {
    document.getElementById('empty-results-popup').classList.remove('show');
  }
  ensureConfigPopupIntegrity() {
    const historyConfigPopup = document.getElementById('history-config-popup');
    if (!historyConfigPopup) return;

    // Check if the popup body has been corrupted
    const popupBody = historyConfigPopup.querySelector('.popup-body');
    if (!popupBody || popupBody.offsetHeight === 0) {
      // Restore the popup structure
      const newContent = `
            <div class="popup-body" style="min-height: 300px; display: block;">
                <div class="history-config-content" style="padding: 30px; display: block;">
                    <div class="card">
                        <div class="card-body">
                            <div class="historical-controls active" id="historical-controls-popup">
                                <div class="quick-ranges">
                                    <button class="quick-range-btn" data-hours="1">1h</button>
                                    <button class="quick-range-btn" data-hours="6">6h</button>
                                    <button class="quick-range-btn" data-hours="24">24h</button>
                                    <button class="quick-range-btn" data-hours="168">1w</button>
                                    <button class="quick-range-btn" data-hours="0">All</button>
                                </div>
                                <div class="time-range-controls">
                                    <div class="control-group">
                                        <label for="start-time-popup">From:</label>
                                        <input type="datetime-local" id="start-time-popup">
                                    </div>
                                    <div class="control-group">
                                        <label for="end-time-popup">To:</label>
                                        <input type="datetime-local" id="end-time-popup">
                                    </div>
                                </div>
                                <div class="validation-error" id="validation-error"></div>
                                <button class="btn" id="apply-time-filter-popup">Apply Time Filter</button>
                                <button class="btn secondary" id="clear-time-filter-popup">Clear Filter</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

      // Replace corrupted content
      const popupContent = historyConfigPopup.querySelector('.popup-content');
      const header = popupContent.querySelector('.popup-header');
      popupContent.innerHTML = header.outerHTML + newContent;
    }
  }
  initializeTimePickersPopup() {
    const now = new Date();
    const endTime = new Date(now);
    const startTime = new Date(now - 24 * 60 * 60 * 1000); // 24 hours ago

    document.getElementById('end-time-popup').value = this.formatDateTimeLocal(endTime);
    document.getElementById('start-time-popup').value = this.formatDateTimeLocal(startTime);
  }

  setQuickTimeRange(hours) {
    const now = new Date();
    const endTime = new Date(now);
    const startTime = new Date(now - hours * 60 * 60 * 1000);

    document.getElementById('start-time-popup').value = this.formatDateTimeLocal(startTime);
    document.getElementById('end-time-popup').value = this.formatDateTimeLocal(endTime);
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

    // Clear location filter inputs when applying time filter
    document.getElementById('location-lat-input').value = '';
    document.getElementById('location-lng-input').value = '';
    document.getElementById('location-radius-input').value = '0.5';

    this.timeFilter = {start: startTime, end: endTime};
    this.activeFilterType = 'time';
    this.locationFilter = null;
    this.persistedLocationFilter = null; // Also clear persisted location filter
    console.log('timeFilter set to:', this.timeFilter);

    this.updateTimeFilterIndicator();
    this.loadHistoricalData();
    this.hideNoFilterOverlay();

    // Close the popup
    document.getElementById('history-config-popup').classList.remove('active');
  }

  clearTimeFilter() {
    this.timeFilter = null;
    this.persistedTimeFilter = null;
    this.persistedLocationFilter = null;
    this.activeFilterType = null;
    this.locationFilter = null;
    this.filteredLocations = [];
    this.updateTimeFilterIndicator();
    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));

    if (this.isHistoryMode) {
      // In history mode, clear everything when filter is cleared
      this.clearAllMarkers();
      this.clearTraceMarkers();
      this.clearAllRoutes(); // Clear routes too
      this.routeCoords = [];
      this.updateRouteLine();
      this.displayFilteredLocations();

      // Show overlay after clearing
      setTimeout(() => {
        this.showNoFilterOverlay();
      }, 100);
    } else {
      // In live mode, reload live data
      this.loadInitialData();
    }

    // Close the popup if open
    document.getElementById('history-config-popup').classList.remove('active');
  }

  async loadHistoricalData() {
    if (!this.timeFilter) return;

    try {
      const startTimestamp = this.timeFilter.start.toISOString();
      const endTimestamp = this.timeFilter.end.toISOString();

      // Build URL with selected devices
      let url = `${this.config.apiBaseUrl}/api/locations/range?start=${startTimestamp}&end=${endTimestamp}`;

      // Add device filter if any devices are selected (not all)
      const selectedDeviceIds = Array.from(this.selectedDevices);
      if (selectedDeviceIds.length > 0 && selectedDeviceIds.length < this.devices.size) {
        // Only add device parameter if not all devices are selected
        selectedDeviceIds.forEach(deviceId => {
          url += `&device=${encodeURIComponent(deviceId)}`;
        });
      }

      const response = await fetch(url);
      if (response.ok) {
        const locations = await response.json();
        this.filteredLocations = locations || [];

        // Clear all existing markers before showing historical data
        this.clearAllMarkers();
        this.displayFilteredLocations();
        this.updateRouteForFiltered();

        if (this.filteredLocations.length > 0) {
          this.fitMapToLocations(this.filteredLocations);
        } else {
          setTimeout(() => this.showEmptyResultsPopup(), 500);
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load historical data:', response.status, errorText);
        this.showError('Failed to load historical data: ' + errorText);
      }
    } catch (error) {
      console.error('Error loading historical data:', error);
      this.showError('Failed to load historical data: ' + error.message);
    }
  }

  updateRouteForDevice() {
    // Clear existing trace markers
    this.clearTraceMarkers();

    // Get all visible device locations
    const visibleLocations = this.locations.filter(loc =>
      this.selectedDevices.has(loc.device_id)
    );

    // Create trace markers for each visible device
    if (this.isHistoryMode) {
      visibleLocations.forEach((loc, index) => {
        const isStart = index === visibleLocations.length - 1;
        const isEnd = index === 0;
        this.createTraceMarker(loc, isStart, isEnd);
      });
    } else {
      visibleLocations.forEach((loc, index) => {
        const isStart = index === visibleLocations.length - 1;
        this.createTraceMarker(loc, isStart, false);
      });
    }

    this.applyTraceDotsVisibility();
    this.updateRouteLegend();
  }

  updateRouteForFiltered() {
    if (!this.isHistoryMode || this.filteredLocations.length === 0) {
      this.routeCoords = [];
      this.updateRouteLine();
      this.clearTraceMarkers();
      return;
    }

    // Group locations by device
    const locationsByDevice = new Map();
    this.filteredLocations.forEach(loc => {
      if (!locationsByDevice.has(loc.device_id)) {
        locationsByDevice.set(loc.device_id, []);
      }
      locationsByDevice.get(loc.device_id).push(loc);
    });

    this.clearTraceMarkers();

    // Create routes and markers for each device
    locationsByDevice.forEach((deviceLocs, deviceId) => {
      if (deviceLocs.length < 1) return;

      const deviceInfo = this.devices.get(deviceId);
      if (!deviceInfo || !deviceInfo.visible) return;

      const coordinates = deviceLocs.map(loc => [loc.longitude, loc.latitude]);
      const sourceId = `route-${deviceId}`;
      const layerId = `route-${deviceId}`;

      // Create/update route line
      if (this.map.getSource(sourceId)) {
        this.map.getSource(sourceId).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        });
      } else {
        this.map.addSource(sourceId, {
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

        this.map.addLayer({
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

      // Create trace markers with gradient
      deviceLocs.forEach((loc, index) => {
        const progress = 1 - (index / (deviceLocs.length - 1));
        const isStart = index === deviceLocs.length - 1;
        const isEnd = index === 0;
        this.createTraceMarker(loc, isStart, isEnd, progress);
      });
    });

    this.applyTraceDotsVisibility();
    this.updateRouteLegend();
  }

  async loadHistoricalByLocation(latitude, longitude, radiusKm = 0.5) {
    console.log('loadHistoricalByLocation called with:', {latitude, longitude, radiusKm});

    try {
      // Build URL with device filter
      let url = `${this.config.apiBaseUrl}/api/locations/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`;

      // Add device filter if specific devices are selected
      const selectedDeviceIds = Array.from(this.selectedDevices);
      if (selectedDeviceIds.length > 0 && selectedDeviceIds.length < this.devices.size) {
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

        this.filteredLocations = locations || [];

        console.log('Filter state set:', {
          locationFilter: this.locationFilter,
          activeFilterType: this.activeFilterType,
          filteredLocationsCount: this.filteredLocations.length
        });

        // Clear time filter inputs
        document.getElementById('start-time-popup').value = '';
        document.getElementById('end-time-popup').value = '';
        document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));

        this.clearAllMarkers();
        this.clearTraceMarkers();
        this.routeCoords = [];
        this.updateRouteLine();
        this.displayFilteredLocations();
        this.updateTimeFilterIndicator();
        this.hideNoFilterOverlay();

        const historyConfigPopup = document.getElementById('history-config-popup');
        if (historyConfigPopup) {
          historyConfigPopup.classList.remove('active');
        }

        if (this.filteredLocations.length > 0) {
          console.log('Has results, fitting map');
          this.fitMapToLocations(this.filteredLocations);
          this.updateRouteForFiltered();
        } else {
          console.log('No results, showing empty results popup');
          setTimeout(() => {
            this.showEmptyResultsPopup(true, radiusKm);
          }, 300);
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load location data:', response.status, errorText);

        const historyConfigPopup = document.getElementById('history-config-popup');
        if (historyConfigPopup) {
          historyConfigPopup.classList.remove('active');
        }

        this.showError('Failed to load location data: ' + response.status);
      }
    } catch (error) {
      console.error('Error loading location data:', error);

      const historyConfigPopup = document.getElementById('history-config-popup');
      if (historyConfigPopup) {
        historyConfigPopup.classList.remove('active');
      }

      this.showError('Failed to load location data: ' + error.message);
    }
  }

  startMapLocationSelection() {
    console.log('Starting map location selection');
    this.isSelectingLocationOnMap = true;

    // Change cursor to crosshair
    this.map.getCanvas().style.cursor = 'crosshair';

    // Show instruction overlay on map
    const instructionDiv = document.createElement('div');
    instructionDiv.id = 'map-selection-instruction';
    instructionDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(102, 126, 234, 0.95);
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        font-size: 16px;
        font-weight: 500;
        z-index: 2000;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        text-align: center;
        pointer-events: none;
    `;
    instructionDiv.innerHTML = `
        <div style="margin-bottom: 10px;">📍 ${this.t('selectLocationOnMap')}</div>
        <div style="font-size: 14px; opacity: 0.9;">${this.t('clickMapToSelect')}</div>
    `;
    document.querySelector('.map-container').appendChild(instructionDiv);

    // Create cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'map-selection-cancel';
    cancelBtn.textContent = this.t('cancelSelection');
    cancelBtn.style.cssText = `
        position: absolute;
        top: 80px;
        right: 20px;
        z-index: 2001;
        background: #ef4444;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    cancelBtn.onclick = () => this.cancelMapLocationSelection();
    document.querySelector('.map-container').appendChild(cancelBtn);

    // Add click handler to map
    this.mapSelectionHandler = (e) => {
      const {lng, lat} = e.lngLat;
      console.log('Map clicked at:', {lat, lng});
      this.selectLocationFromMap(lat, lng);
    };

    this.map.once('click', this.mapSelectionHandler);
  }

  cancelMapLocationSelection() {
    console.log('Canceling map location selection');
    this.isSelectingLocationOnMap = false;

    // Restore cursor
    this.map.getCanvas().style.cursor = '';

    // Remove instruction overlay
    const instruction = document.getElementById('map-selection-instruction');
    if (instruction) instruction.remove();

    // Remove cancel button
    const cancelBtn = document.getElementById('map-selection-cancel');
    if (cancelBtn) cancelBtn.remove();

    // Remove map click handler if it exists
    if (this.mapSelectionHandler) {
      this.map.off('click', this.mapSelectionHandler);
      this.mapSelectionHandler = null;
    }
  }

  selectLocationFromMap(lat, lng) {
    console.log('Location selected from map:', {lat, lng});

    // Clean up selection mode first
    this.cancelMapLocationSelection();

    // Show success message briefly
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(16, 185, 129, 0.95);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10600;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;
    successDiv.textContent = this.t('locationSelected');
    document.body.appendChild(successDiv);

    setTimeout(() => {
      successDiv.remove();

      // Reopen the history config popup on the location filter tab
      this.lastActiveConfigTab = 'location-filter';
      this.openHistoryConfigPopup();

      // Update the input fields AFTER popup opens to ensure they exist
      setTimeout(() => {
        const latInput = document.getElementById('location-lat-input');
        const lngInput = document.getElementById('location-lng-input');

        if (latInput && lngInput) {
          // Force update the values
          latInput.value = lat.toFixed(6);
          lngInput.value = lng.toFixed(6);

          // Trigger validation
          latInput.dispatchEvent(new Event('input', {bubbles: true}));
          lngInput.dispatchEvent(new Event('change', {bubbles: true}));

          console.log('Coordinates updated:', {lat: latInput.value, lng: lngInput.value});
        } else {
          console.error('Input fields not found after reopening popup');
        }
      }, 100);
    }, 1500);
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

  clearAllMarkers() {
    this.markers.forEach(marker => marker.remove());
    this.markers.clear();
  }
  clearAllRoutes() {
    // Remove all device route layers and sources
    this.devices.forEach((info, deviceId) => {
      const sourceId = `route-${deviceId}`;
      const layerId = `route-${deviceId}`;

      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    });

    // Also clear the old gradient route system if it exists
    if (this.map.getSource('route')) {
      // Remove all segment layers
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
  connectWebSocket() {
    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.updateConnectionStatus('Connected', 'connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleLocationUpdate(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.updateConnectionStatus('Disconnected', 'disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus('Connection Error', 'disconnected');
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.updateConnectionStatus('Connection Failed', 'disconnected');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      this.updateConnectionStatus(
        `Reconnecting in ${Math.ceil(delay / 1000)}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
        'reconnecting'
      );

      setTimeout(() => {
        this.connectWebSocket();
      }, delay);
    } else {
      this.updateConnectionStatus('Connection failed - refresh page', 'disconnected');
    }
  }

  async loadInitialData() {
    try {
      // In live mode, only fetch the latest location from DB
      const limit = this.isHistoryMode ? this.historyLimit : 1;
      const response = await fetch(`${this.config.apiBaseUrl}/api/locations/history?limit=${limit}`);
      if (response.ok) {
        const locations = await response.json();

        if (this.isHistoryMode) {
          // History mode: load all requested locations
          this.locations = locations || [];
        } else {
          // Live mode: only store the initial DB location
          this.initialDbLocation = locations.length > 0 ? locations[0] : null;
          this.liveLocations = [];
          this.hasReceivedLiveUpdate = false;

          // Set locations to show only the initial one
          this.locations = this.initialDbLocation ? [this.initialDbLocation] : [];
        }

        this.displayLocations();
        this.updateStatistics();

        // Update route and create trace markers
        this.updateRouteForDevice();

        if (this.locations.length > 0) {
          this.updateMapMarker(this.locations[0], true);
          if (this.isTrackingLatest) {
            this.centerMapOnLatestLocation();
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

  handleLocationUpdate(location) {
    console.log('Received location update:', location);

    // Only process new locations if not in history mode
    if (this.isHistoryMode) {
      this.liveUpdateQueue.push(location);
      return;
    }
    this.applyLocationUpdate(location);
  }

  updateMapMarker(location, isLatest = false) {
    const deviceId = location.device_id;
    let marker = this.markers.get(deviceId);

    // Get device color
    const deviceColor = this.getDeviceColor(deviceId);
    const deviceInfo = this.devices.get(deviceId);

    const popupContent = `
      <div style="font-family: system-ui; min-width: 200px;">
        <h4 style="margin: 0 0 10px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${deviceColor};"></div>
          ${deviceId}
        </h4>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
          <strong>${this.t('coordinates')}:</strong><br>
          ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </div>
        <div style="font-size: 12px; color: #6b7280;">
          <strong>${this.t('time')}:</strong><br>
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
      }

      marker = new maplibregl.Marker({
        element: el || undefined,
        color: isLatest ? undefined : deviceColor
      })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(new maplibregl.Popup().setHTML(popupContent))
        .addTo(this.map);

      this.markers.set(deviceId, marker);

      // Hide if device not visible
      if (deviceInfo && !deviceInfo.visible) {
        marker.getElement().style.display = 'none';
      }
    } else {
      marker.setLngLat([location.longitude, location.latitude]);
      marker.setPopup(new maplibregl.Popup().setHTML(popupContent));

      const el = marker.getElement();
      if (isLatest) {
        el.style.backgroundColor = deviceColor;
      }
    }
  }

  applyLocationUpdate(location) {
    if (!this.hasReceivedLiveUpdate) {
      this.hasReceivedLiveUpdate = true;
      this.locations = [];
      this.clearAllMarkers();
      this.clearTraceMarkers();
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
      this.getDeviceColor(location.device_id);
      this.selectedDevices.add(location.device_id);
    }

    this.updateDeviceLegend();
    this.updateDeviceFilterList();
    this.filterAndDisplayLocations();
    this.updateStatistics();

    if (this.selectedDevices.has(location.device_id)) {
      this.updateMapMarker(location, !this.isHistoryMode);
      this.updateDeviceRoute(location.device_id);

      if (this.isTrackingLatest && !this.userInteracted) {
        // If only one device is visible, center on it
        if (this.selectedDevices.size === 1) {
          this.centerMapOnLocation(location);
        } else {
          // Multiple devices - fit all visible devices
          this.centerMapOnDevices();
        }
      }
    }
  }
  getDeviceColor(deviceId) {
    const colors = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316'];
    const hash = deviceId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  }

  centerMapOnLatestLocation() {
    if (this.locations.length > 0) {
      this.centerMapOnLocation(this.locations[0]);
    }
  }

  centerMapOnLocation(location) {
    // still mark that the user has not manually interacted
    this.userInteracted = false;

    // indicate the upcoming move is programmatic so event handlers ignore it
    this.suppressUserInteraction = true;

    this.map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(this.map.getZoom(), 12),
      duration: 800
    });

    // clear suppression when the programmatic move finishes
    this.map.once('moveend', () => {
      // tiny delay to let chained events settle
      setTimeout(() => {this.suppressUserInteraction = false;}, 50);
    });
  }
  centerMapOnDevices() {
    // Get latest location for each visible device
    const latestByDevice = new Map();

    this.locations.forEach(loc => {
      if (this.selectedDevices.has(loc.device_id) && !latestByDevice.has(loc.device_id)) {
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

    this.suppressUserInteraction = true;
    this.map.fitBounds(bounds, {
      padding: 100,
      maxZoom: 15,
      duration: 800
    });

    this.map.once('moveend', () => {
      setTimeout(() => {this.suppressUserInteraction = false;}, 50);
    });
  }
  selectLocation(locationIndex) {
    this.selectedLocationIndex = locationIndex;
    this.userInteracted = false;

    if (locationIndex >= 0) {
      this.toggleTracking(false);
      const locations = this.isHistoryMode ? this.filteredLocations : this.getFilteredLocations();
      const location = locations[locationIndex];
      if (location) {
        this.centerMapOnLocation(location);
        // Create a temporary marker for the selected location, don't interfere with the latest marker
        this.showSelectedLocationMarker(location);
      }
    } else {
      // Clear any selected location marker when deselecting
      this.clearSelectedLocationMarker();
    }

    this.updateLocationSelection();
  }

  showSelectedLocationMarker(location) {
    // Remove existing selected marker if any
    this.clearSelectedLocationMarker();

    const popupContent = `
        <div style="font-family: system-ui; min-width: 200px;">
            <h4 style="margin: 0 0 10px 0; color: #374151;">${location.device_id} <span style="color: #f59e0b; font-size: 12px;">(${this.t('selected')})</span></h4>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                <strong>${this.t('coordinates')}:</strong><br>
                ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
                <strong>${this.t('time')}:</strong><br>
                ${new Date(location.timestamp).toLocaleString()}
            </div>
            <button onclick="locationTracker.clearSelectedLocation()" style="margin-top: 10px; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                ${this.t('clearSelection')}
            </button>
        </div>
    `;

    // Create a distinct marker for selected locations
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

    this.selectedLocationMarker = new maplibregl.Marker({element: el})
      .setLngLat([location.longitude, location.latitude])
      .setPopup(new maplibregl.Popup().setHTML(popupContent))
      .addTo(this.map);

    // Auto-show popup
    this.selectedLocationMarker.togglePopup();
  }

  clearSelectedLocationMarker() {
    if (this.selectedLocationMarker) {
      this.selectedLocationMarker.remove();
      this.selectedLocationMarker = null;
    }
  }

  clearSelectedLocation() {
    this.selectedLocationIndex = -1;
    this.clearSelectedLocationMarker();
    this.updateLocationSelection();
    // Re-enable tracking if we were tracking before
    if (!this.userInteracted) {
      this.toggleTracking(true);
    }
  }

  getFilteredLocations() {
    return this.locations.filter(loc =>
      this.selectedDevices.has(loc.device_id)
    );
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

  filterAndDisplayLocations() {
    // Filter by visible devices
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
            onclick="locationTracker.selectLocation(${index})">
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

    console.log('displayFilteredLocations called with', this.filteredLocations.length, 'locations'); // ✅ Debug log

    if (this.filteredLocations.length === 0) {
      container.innerHTML = `<div class="loading">${this.t('noLocationsFound')}</div>`;
      return;
    }

    container.innerHTML = this.filteredLocations.map((location, index) => `
          <div class="location-item ${index === this.selectedLocationIndex ? 'selected' : ''}" 
                onclick="locationTracker.selectLocation(${index})">
              <div class="device-id">${location.device_id}</div>
              <div class="coordinates">${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</div>
              <div class="timestamp">${new Date(location.timestamp).toLocaleString()}</div>
          </div>
      `).join('');
  }

  updateStatistics() {
    document.getElementById('total-locations').textContent = this.locations.length;
    document.getElementById('active-devices').textContent = this.devices.size;
    document.getElementById('last-update').textContent =
      this.locations.length > 0 ? new Date(this.locations[0].timestamp).toLocaleString() : '-';
  }

  updateConnectionStatus(message, status) {
    const statusElement = document.getElementById('connection-status');
    statusElement.className = `status ${status}`;

    // Translate common status messages
    let translatedMessage = message;
    const translations = {
      'Connected': this.t('connected'),
      'Connecting...': this.t('connecting'),
      'Disconnected': this.t('disconnected'),
      'Connection Error': this.t('connectionError'),
      'Connection failed - refresh page': this.t('connectionFailed')
    };

    // Check if message matches a translatable string
    if (translations[message]) {
      translatedMessage = translations[message];
    } else if (message.includes('Reconnecting in')) {
      // Handle reconnecting messages with parameters
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
  showError(message) {
    const container = document.getElementById('location-list');
    container.innerHTML = `<div class="error">${message}</div>`;
  }

  async refreshData() {
    try {
      if (this.isHistoryMode && this.timeFilter) {
        await this.loadHistoricalData();
      } else {
        // In live mode, reset to initial state
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
  getDeviceColor(deviceId) {
    if (!this.devices.has(deviceId)) {
      const colorIndex = this.devices.size % this.deviceColors.length;
      this.devices.set(deviceId, {
        color: this.deviceColors[colorIndex],
        visible: true,
        count: 0
      });
    }
    return this.devices.get(deviceId).color;
  }

  async loadDevices() {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/devices`);
      if (response.ok) {
        const deviceList = await response.json();

        deviceList.forEach(device => {
          if (!this.devices.has(device.device_id)) {
            const colorIndex = this.devices.size % this.deviceColors.length;
            this.devices.set(device.device_id, {
              color: this.deviceColors[colorIndex],
              visible: true,
              count: device.location_count,
              lastSeen: device.last_seen
            });
          }
          this.selectedDevices.add(device.device_id);
        });

        this.updateDeviceLegend();
        this.updateDeviceFilterList();
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }

  updateDeviceLegend() {
    const container = document.getElementById('legend-items');
    const countElement = document.getElementById('device-count');

    countElement.textContent = this.devices.size;

    if (this.devices.size === 0) {
      container.innerHTML = `<div style="color: #9ca3af; font-size: 12px;">${this.t('noDevicesFound')}</div>`;
      return;
    }

    container.innerHTML = '';

    this.devices.forEach((info, deviceId) => {
      const item = document.createElement('div');
      item.className = `legend-item ${!info.visible ? 'disabled' : ''}`;

      item.innerHTML = `
        <input type="checkbox" class="legend-checkbox" ${info.visible ? 'checked' : ''} 
              data-device="${deviceId}">
        <div class="legend-color" style="background-color: ${info.color}"></div>
        <div class="legend-info">
          <div class="legend-device-name">${deviceId}</div>
          <div class="legend-stats">${this.t('locationsCount').replace('{0}', info.count)}</div>
        </div>
      `;

      const checkbox = item.querySelector('.legend-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleDeviceVisibility(deviceId, checkbox.checked);
      });

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.toggleDeviceVisibility(deviceId, checkbox.checked);
        }
      });

      container.appendChild(item);
    });
  }

  updateDeviceFilterList() {
    const container = document.getElementById('device-filter-list');

    if (this.devices.size === 0) {
      container.innerHTML = `<div style="color: #9ca3af; padding: 10px;">${this.t('noDevicesFound')}</div>`;
      return;
    }

    container.innerHTML = '';

    this.devices.forEach((info, deviceId) => {
      const item = document.createElement('div');
      item.className = 'device-filter-item';

      item.innerHTML = `
        <input type="checkbox" class="device-filter-checkbox" ${info.visible ? 'checked' : ''} 
              data-device="${deviceId}">
        <div class="device-filter-color" style="background-color: ${info.color}"></div>
        <span style="font-size: 13px; color: #374151;">${deviceId}</span>
      `;

      const checkbox = item.querySelector('.device-filter-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleDeviceVisibility(deviceId, checkbox.checked);
      });

      item.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.toggleDeviceVisibility(deviceId, checkbox.checked);
        }
      });

      container.appendChild(item);
    });
  }

  toggleDeviceVisibility(deviceId, visible) {
    const deviceInfo = this.devices.get(deviceId);
    if (deviceInfo) {
      deviceInfo.visible = visible;

      if (visible) {
        this.selectedDevices.add(deviceId);
      } else {
        this.selectedDevices.delete(deviceId);
      }

      // Update marker visibility
      const marker = this.markers.get(deviceId);
      if (marker) {
        const el = marker.getElement();
        el.style.display = visible ? 'block' : 'none';
      }

      // Update routes visibility
      this.updateRoutesVisibility();
      this.updateDeviceLegend();
      this.updateDeviceFilterList();

      // CRITICAL FIX: Re-apply filters in history mode when device selection changes
      if (this.isHistoryMode) {
        if (this.activeFilterType === 'time' && this.timeFilter) {
          // Re-fetch with new device selection
          this.loadHistoricalData();
        } else if (this.activeFilterType === 'location' && this.locationFilter) {
          // Re-fetch with new device selection
          this.loadHistoricalByLocation(
            this.locationFilter.lat,
            this.locationFilter.lng,
            this.locationFilter.radius
          );
        } else {
          // Just update display if no filter active
          this.filterAndDisplayLocations();
        }
      } else {
        // Live mode - just update display
        this.filterAndDisplayLocations();
      }
    }
  }

  updateRoutesVisibility() {
    this.devices.forEach((info, deviceId) => {
      const layerId = `route-${deviceId}`;
      if (this.map.getLayer(layerId)) {
        this.map.setLayoutProperty(
          layerId,
          'visibility',
          info.visible ? 'visible' : 'none'
        );
      }
    });
  }

  updateDeviceRoute(deviceId) {
    const deviceLocations = this.locations
      .filter(loc => loc.device_id === deviceId)
      .slice(0, 50);

    if (deviceLocations.length < 2) return;

    const coordinates = deviceLocations.map(loc => [loc.longitude, loc.latitude]);
    const deviceInfo = this.devices.get(deviceId);

    const sourceId = `route-${deviceId}`;
    const layerId = `route-${deviceId}`;

    if (this.map.getSource(sourceId)) {
      this.map.getSource(sourceId).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    } else {
      this.map.addSource(sourceId, {
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

      this.map.addLayer({
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

    // Update visibility
    if (this.map.getLayer(layerId)) {
      this.map.setLayoutProperty(
        layerId,
        'visibility',
        deviceInfo.visible ? 'visible' : 'none'
      );
    }

    // Create trace markers with gradient halos
    deviceLocations.forEach((loc, index) => {
      const progress = 1 - (index / (deviceLocations.length - 1)); // 0 = oldest, 1 = newest
      const isStart = index === deviceLocations.length - 1;
      const isEnd = index === 0;

      if (!this.isHistoryMode && isEnd) {
        // Skip end marker in live mode (pulse marker handles it)
        return;
      }

      this.createTraceMarker(loc, isStart, isEnd, progress);
    });
  }
}

// Initialize the application
let locationTracker;
document.addEventListener('DOMContentLoaded', () => {
  locationTracker = new LocationTracker();
});

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && locationTracker) {
    if (!locationTracker.ws || locationTracker.ws.readyState !== WebSocket.OPEN) {
      locationTracker.connectWebSocket();
    }
  }
});
