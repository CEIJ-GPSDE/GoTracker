class LocationTracker {
    constructor() {
        this.ws = null;
        this.map = null;
        this.markers = new Map();
        this.locations = [];
        this.filteredLocations = [];
        this.devices = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.selectedDevice = '';
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
                noLocationsFound: "No locations found",
                historicalViewConfig: "📅 Historical View Configuration",
                quickRanges: ["1h", "6h", "24h", "1w", "All"],
                from: "From:",
                to: "To:",
                applyTimeFilter: "Apply Time Filter",
                clearFilter: "Clear Filter",
                noResultsTitle: "No Results Found",
                noResultsMessage: "The selected time range contains no location data.",
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
                radiusLabel: "Radius:",
                km: "km",
                noFilterSelected: "No filter selected",
                pleaseSelectFilter: "Please select a time range or location to view historical data.",
                selectFilterTab: "Choose a tab above to configure your filter.",
                selectOnMap: "Select on Map",
                selectLocationOnMap: "Click on the map to select a location",
                clickMapToSelect: "Click anywhere on the map to set the location for filtering",
                cancelSelection: "Cancel",
                locationSelected: "Location selected! Coordinates updated.",
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
                noLocationsFound: "No se encontraron ubicaciones",
                historicalViewConfig: "📅 Configuración de Vista Histórica",
                quickRanges: ["1h", "6h", "24h", "1sem", "Todo"],
                from: "Desde:",
                to: "Hasta:",
                applyTimeFilter: "Aplicar Filtro de Tiempo",
                clearFilter: "Limpiar Filtro",
                noResultsTitle: "No se Encontraron Resultados",
                noResultsMessage: "El rango de tiempo seleccionado no contiene datos de ubicación.",
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
                radiusLabel: "Radio:",
                km: "km",
                noFilterSelected: "Ningún filtro seleccionado",
                pleaseSelectFilter: "Por favor seleccione un rango de tiempo o ubicación para ver datos históricos.",
                selectFilterTab: "Elija una pestaña arriba para configurar su filtro.",
                selectOnMap: "Seleccionar en Mapa",
                selectLocationOnMap: "Haga clic en el mapa para seleccionar una ubicación",
                clickMapToSelect: "Haga clic en cualquier lugar del mapa para establecer la ubicación del filtro",
                cancelSelection: "Cancelar",
                locationSelected: "¡Ubicación seleccionada! Coordenadas actualizadas.",
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
        document.querySelector('label[for="device-filter"]').textContent = this.t('filterByDevice');
        document.querySelector('label[for="history-limit"]').textContent = this.t('historyLimit');
        document.getElementById('refresh-data-btn').textContent = 
            this.isHistoryMode ? this.t('refreshDataHistorical') : this.t('refreshData');

        document.getElementById('trace-dots-label').textContent = this.t('showTraceDots');

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
        if (noFilterBtnText) noFilterBtnText.textContent = this.t('openHistorySettings');
        if (noFilterDismissText) noFilterDismissText.textContent = this.t('dismiss');
        
        // Update no filter selected message
        const noFilterSelectedTitle = document.getElementById('no-filter-selected-title');
        const pleaseSelectFilter = document.getElementById('please-select-filter');
        const selectFilterTab = document.getElementById('select-filter-tab');
        
        if (noFilterSelectedTitle) noFilterSelectedTitle.textContent = this.t('noFilterSelected');
        if (pleaseSelectFilter) pleaseSelectFilter.textContent = this.t('pleaseSelectFilter');
        if (selectFilterTab) selectFilterTab.textContent = this.t('selectFilterTab');


        // Update empty results popup
        document.querySelector('#empty-results-popup h3').textContent = this.t('noResultsTitle');
        document.querySelector('#empty-results-popup p').textContent = this.t('noResultsMessage');
        document.querySelector('#empty-results-popup .btn').textContent = this.t('ok');
        
        // Update route legend
        const legendStart = document.getElementById('legend-start');
        const legendEnd = document.getElementById('legend-end');
        if (legendStart) legendStart.textContent = this.t('legendStart');
        if (legendEnd) legendEnd.textContent = this.t('legendEnd');
        
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
        this.updateDevicesList();
    }

    async initializeApp() {
        try {
            this.initializeMap();
            this.setupEventListeners();
            this.setupPopupMenu();
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

    // Initialize map (continued in next part)
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
        
        const historyConfigPopup = document.getElementById('history-config-popup');
        const historyConfigClose = document.getElementById('history-config-close');
        
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

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

    handleUserInteraction() {
        if (this.suppressUserInteraction) return;

        if (!this.userInteracted) {
            this.userInteracted = true;
            if (this.isTrackingLatest) {
                this.toggleTracking(false);
            }
        }
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
        
        const coordinates = this.routeCoords;
        
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
        
        if (this.routeCoords.length > 1) {
            legend.style.display = 'block';
        } else {
            legend.style.display = 'none';
        }
    }

    createTraceMarker(location, isStart = false, isEnd = false) {
        const popupContent = `
            <div style="font-family: system-ui; min-width: 200px;">
                <h4 style="margin: 0 0 10px 0; color: #374151;">
                    ${location.device_id}
                    ${isStart ? ' <span style="color: #10b981; font-size: 12px;">(START)</span>' : ''}
                    ${isEnd ? ' <span style="color: #ef4444; font-size: 12px;">(END)</span>' : ''}
                </h4>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                    <strong>Coordinates:</strong><br>
                    ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
                </div>
                <div style="font-size: 12px; color: #6b7280;">
                    <strong>Time:</strong><br>
                    ${new Date(location.timestamp).toLocaleString()}
                </div>
            </div>
        `;

        const el = document.createElement('div');
        el.className = 'trace-marker';
        
        if (isStart) {
            el.classList.add('start-point');
        } else if (isEnd) {
            el.classList.add('end-point');
        }

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([location.longitude, location.latitude])
            .setPopup(new maplibregl.Popup().setHTML(popupContent))
            .addTo(this.map);

        this.traceMarkers.push(marker);
    }

    clearTraceMarkers() {
        this.traceMarkers.forEach(m => m.remove());
        this.traceMarkers = [];
    }

    initializeTimePickers() {
        const now = new Date();
        const endTime = new Date(now);
        const startTime = new Date(now - 24 * 60 * 60 * 1000);

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
            if (this.locations.length > 0) {
                this.centerMapOnLatestLocation();
            }
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
        
        this.clearSelectedLocationMarker();
        this.selectedLocationIndex = -1;
        
        if (this.isHistoryMode) {        
            modeIndicator.className = 'mode-indicator history-mode';
            modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.t('historyModeBadge')}</span>`;

            historyBtn.style.display = 'none';
            historyConfigBtn.style.display = 'flex';
            liveModeBtn.style.display = 'flex';
            trackBtn.style.display = 'none';
        
            this.toggleTracking(false);
        
            this.clearAllMarkers();
            this.clearTraceMarkers();
            this.routeCoords = [];
            this.updateRouteLine();
        
            const hasPersistedTimeFilter = this.persistedTimeFilter !== null;
            const hasPersistedLocationFilter = this.persistedLocationFilter !== null;

            if (hasPersistedTimeFilter) {
                this.timeFilter = { ...this.persistedTimeFilter };
                this.activeFilterType = 'time';
                this.locationFilter = null;
                this.restoreTimePickerValues();
                this.updateTimeFilterIndicator();
                this.loadHistoricalData();
                this.hideNoFilterOverlay();
            } else if (hasPersistedLocationFilter) {
                this.locationFilter = { ...this.persistedLocationFilter };
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
            modeIndicator.className = 'mode-indicator live-mode';
            modeIndicator.innerHTML = `<div class="mode-indicator-dot"></div><span>${this.t('liveModeBadge')}</span>`;

            if (this.timeFilter && this.activeFilterType === 'time') {
                this.persistedTimeFilter = { ...this.timeFilter };
                this.persistedLocationFilter = null;
            } else if (this.locationFilter && this.activeFilterType === 'location') {
                this.persistedLocationFilter = { ...this.locationFilter };
                this.persistedTimeFilter = null;
            }
        
            historyBtn.style.display = 'flex';
            historyConfigBtn.style.display = 'none';
            liveModeBtn.style.display = 'none';
            trackBtn.style.display = 'flex';
        
            this.clearAllMarkers();
            this.clearTraceMarkers();
            this.filteredLocations = [];
            this.updateTimeFilterIndicator();
        
            this.loadInitialData();
        
            while (this.liveUpdateQueue.length > 0) {
                const queuedLocation = this.liveUpdateQueue.shift();
                this.applyLocationUpdate(queuedLocation);
            }
        }

        this.updateRefreshButtonState();
        this.updateLocationSelection();
        this.hideNoFilterOverlay();

        this.updateUILanguage();
    }

    showNoFilterOverlay() {
        console.log('showNoFilterOverlay called');
        const overlay = document.getElementById('no-filter-overlay');
        if (overlay) {
            console.log('Overlay found, adding show class');

            // Update text to prompt user to choose a filter
            const title = overlay.querySelector('h3');
            const message = overlay.querySelector('p');

            if (title) {
                title.textContent = this.currentLanguage === 'es' 
                    ? '⚠️ No se Aplicó Filtro' 
                    : '⚠️ No Filter Applied';
            }

            if (message) {
                message.textContent = this.currentLanguage === 'es'
                    ? 'Por favor seleccione un filtro de tiempo o ubicación en Ajustes de Historial para ver datos históricos.'
                    : 'Please select a time or location filter in History Settings to view historical data.';
            }

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

    setupEventListeners() {
        document.getElementById('track-latest-btn').addEventListener('click', () => {
            this.userInteracted = false;
            this.suppressUserInteraction = false;
            this.selectedLocationIndex = -1;
            this.toggleTracking(true);
            this.updateLocationSelection();
        });

        document.getElementById('history-mode-btn').addEventListener('click', () => {
            this.toggleHistoryMode();
        });

        document.getElementById('live-mode-btn').addEventListener('click', () => {
            this.toggleHistoryMode();
        });

        document.getElementById('history-config-btn').addEventListener('click', () => {
            this.openHistoryConfigPopup();
        });

        document.getElementById('toggle-trace-dots').addEventListener('change', (e) => {
            this.showTraceDots = e.target.checked;
            this.applyTraceDotsVisibility();
        });

        document.getElementById('device-filter').addEventListener('change', (e) => {
            this.selectedDevice = e.target.value;
            this.filterAndDisplayLocations();
            this.updateRouteForDevice();
        });

        document.getElementById('history-limit').addEventListener('change', (e) => {
            this.historyLimit = parseInt(e.target.value);
            this.refreshData();
        });
        
        document.getElementById('language-selector').addEventListener('change', (e) => {
            this.setLanguage(e.target.value);
        });

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

        const timeFilterTab = document.getElementById('time-filter-tab');
        const locationFilterTab = document.getElementById('location-filter-tab');
        const noFilterTab = document.getElementById('no-filter-selected-tab');
        const tabButtons = historyConfigPopup.querySelectorAll('.tab-button');  

        if (timeFilterTab) timeFilterTab.classList.remove('active');
        if (locationFilterTab) locationFilterTab.classList.remove('active');
        if (noFilterTab) noFilterTab.style.display = 'none';
        tabButtons.forEach(btn => btn.classList.remove('active'));  

        const latInput = document.getElementById('location-lat-input');
        const lngInput = document.getElementById('location-lng-input');
        const radiusInput = document.getElementById('location-radius-input');

        if (this.activeFilterType === 'location' && this.locationFilter) {
            latInput.value = this.locationFilter.lat;
            lngInput.value = this.locationFilter.lng;
            radiusInput.value = this.locationFilter.radius;
        }
        
        if (!latInput.value && !lngInput.value && !radiusInput.value) {
            radiusInput.value = '0.5';
        }

        let tabToShow = null;

        if (this.activeFilterType === 'time' && this.timeFilter) {
            tabToShow = 'time-filter';
            this.lastActiveConfigTab = 'time-filter';
            document.getElementById('start-time-popup').value = this.formatDateTimeLocal(this.timeFilter.start);
            document.getElementById('end-time-popup').value = this.formatDateTimeLocal(this.timeFilter.end);
        } else if (this.activeFilterType === 'location' && this.locationFilter) {
            tabToShow = 'location-filter';
            this.lastActiveConfigTab = 'location-filter';
        } else {
            // No active filter - show the "no filter selected" message
            if (noFilterTab) {
                noFilterTab.classList.add('active');
                noFilterTab.style.display = 'block';
            }
            // Don't activate any specific tab button yet - let user choose
            tabToShow = null;
        }

        if (tabToShow === 'time-filter') {
            if (timeFilterTab) timeFilterTab.classList.add('active');
            document.getElementById('time-filter-tab-btn').classList.add('active');
        } else if (tabToShow === 'location-filter') {
            if (locationFilterTab) locationFilterTab.classList.add('active');
            document.getElementById('location-filter-tab-btn').classList.add('active');
        }

        historyConfigPopup.classList.add('active'); 

        console.log('Popup shown, setting up events');  

        this.setupConfigPopupEvents(historyConfigPopup);
    }

    setupConfigPopupEvents(popup) {
        console.log('Setting up config popup events');

        const controlsContainer = popup.querySelector('#historical-controls-popup');
        if (controlsContainer) {
            console.log('Time filter controls found');

            const startInput = popup.querySelector('#start-time-popup');
            const endInput = popup.querySelector('#end-time-popup');
            const applyBtn = popup.querySelector('#apply-time-filter-popup');
            const clearBtn = popup.querySelector('#clear-time-filter-popup');

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

        const tabButtons = popup.querySelectorAll('.tab-button');
        const tabContents = popup.querySelectorAll('.tab-content');

        console.log('Found tab buttons:', tabButtons.length);
        console.log('Found tab contents:', tabContents.length);

        tabButtons.forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
        
            newButton.addEventListener('click', () => {
                const tabId = newButton.dataset.tab;
                console.log('Tab clicked:', tabId);
            
                this.lastActiveConfigTab = tabId;
            
                popup.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                newButton.classList.add('active');
            
                const noFilterTab = popup.querySelector('#no-filter-selected-tab');
                const timeFilterTab = popup.querySelector('#time-filter-tab');
                const locationFilterTab = popup.querySelector('#location-filter-tab');

                if (noFilterTab) {
                    noFilterTab.classList.remove('active');
                    noFilterTab.style.display = 'none';
                }
                if (timeFilterTab) timeFilterTab.classList.remove('active');
                if (locationFilterTab) locationFilterTab.classList.remove('active');
            
                if (tabId === 'time-filter' && timeFilterTab) {
                    timeFilterTab.classList.add('active');
                    console.log('Activated tab: time-filter-tab');
                } else if (tabId === 'location-filter' && locationFilterTab) {
                    locationFilterTab.classList.add('active');
                    console.log('Activated tab: location-filter-tab');
                }
            });
        });

        const locationTab = popup.querySelector('#location-filter-tab');
        console.log('Location filter tab found:', !!locationTab);

        if (locationTab) {
            const latInput = locationTab.querySelector('#location-lat-input');
            const lngInput = locationTab.querySelector('#location-lng-input');
            const radiusInput = locationTab.querySelector('#location-radius-input');
            let applyLocationBtn = locationTab.querySelector('#apply-location-filter');
            const clearLocationBtn = locationTab.querySelector('#clear-location-filter');
            const errorElement = locationTab.querySelector('#location-validation-error');
        
            console.log('Location filter elements:', {
                latInput: !!latInput,
                lngInput: !!lngInput,
                radiusInput: !!radiusInput,
                applyLocationBtn: !!applyLocationBtn,
                clearLocationBtn: !!clearLocationBtn,
                errorElement: !!errorElement
            });
        
            const validateLocationFilter = () => {
                const currentApplyBtn = locationTab.querySelector('#apply-location-filter');
                if (!currentApplyBtn) return false;
            
                const lat = parseFloat(latInput.value);
                const lng = parseFloat(lngInput.value);
                const radius = parseFloat(radiusInput.value);
            
                this.clearValidationError(currentApplyBtn, errorElement);
            
                if (latInput.value === '' || lngInput.value === '') {
                    currentApplyBtn.disabled = true;
                    return false;
                }
            
                if (isNaN(lat) || isNaN(lng)) {
                    this.showValidationError('validLocationRequired', currentApplyBtn, errorElement);
                    return false;
                }
            
                if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    this.showValidationError('invalidCoordinates', currentApplyBtn, errorElement);
                    return false;
                }
            
                if (isNaN(radius) || radius <= 0) {
                    this.showValidationError('invalidRadius', currentApplyBtn, errorElement);
                    return false;
                }
            
                currentApplyBtn.disabled = false;
                return true;
            };
        
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
                const newApplyLocationBtn = applyLocationBtn.cloneNode(true);
                applyLocationBtn.parentNode.replaceChild(newApplyLocationBtn, applyLocationBtn);
                applyLocationBtn = newApplyLocationBtn;
            
                newApplyLocationBtn.addEventListener('click', () => {
                    console.log('Apply location filter clicked');
                
                    const lat = parseFloat(latInput.value);
                    const lng = parseFloat(lngInput.value);
                    const radius = parseFloat(radiusInput.value);
                
                    console.log('Location filter values:', { lat, lng, radius });
                
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
                
                    document.getElementById('start-time-popup').value = '';
                    document.getElementById('end-time-popup').value = '';
                    document.querySelectorAll('.quick-range-btn').forEach(btn => btn.classList.remove('active'));
                
                    this.loadHistoricalByLocation(lat, lng, radius);
                    popup.classList.remove('active');
                });
            } else {
                console.error('Apply location button not found!');
            }
        
            if (clearLocationBtn) {
                const newClearLocationBtn = clearLocationBtn.cloneNode(true);
                clearLocationBtn.parentNode.replaceChild(newClearLocationBtn, clearLocationBtn);
            
                newClearLocationBtn.addEventListener('click', () => {
                    console.log('Clear location filter clicked');

                    latInput.value = '';
                    lngInput.value = '';
                    radiusInput.value = '0.5';

                    const currentApplyBtn = locationTab.querySelector('#apply-location-filter');
                    this.clearValidationError(currentApplyBtn, errorElement);
                    if (currentApplyBtn) currentApplyBtn.disabled = true;

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
        
            setTimeout(() => validateLocationFilter(), 100);
        } else {
            console.error('Location filter tab not found!');
        }

        const selectOnMapBtn = popup.querySelector('#select-on-map-btn');
        if (selectOnMapBtn) {
            const newSelectOnMapBtn = selectOnMapBtn.cloneNode(true);
            selectOnMapBtn.parentNode.replaceChild(newSelectOnMapBtn, selectOnMapBtn);
        
            newSelectOnMapBtn.addEventListener('click', () => {
                console.log('Select on map button clicked');

                popup.classList.remove('active');

                this.startMapLocationSelection();
            });
        }
    }

    restoreTimePickerValues() {
        if (this.persistedTimeFilter) {
            document.getElementById('start-time-popup').value = this.formatDateTimeLocal(this.persistedTimeFilter.start);
            document.getElementById('end-time-popup').value = this.formatDateTimeLocal(this.persistedTimeFilter.end);
            this.updateTimeFilterIndicator();
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

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            this.showValidationError('Invalid date format', applyBtn, errorElement);
            return false;
        }

        if (startTime >= endTime) {
            this.showValidationError('Start time must be before end time', applyBtn, errorElement);
            return false;
        }

        if (endTime > new Date(now.getTime() + 60000)) {
            this.showValidationError('End time cannot be in the future', applyBtn, errorElement);
            return false;
        }

        const maxDuration = 365 * 24 * 60 * 60 * 1000;
        if (endTime.getTime() - startTime.getTime() > maxDuration) {
            this.showValidationError('Time range cannot exceed 1 year', applyBtn, errorElement);
            return false;
        }

        const minDuration = 60 * 1000;
        if (endTime.getTime() - startTime.getTime() < minDuration) {
            this.showValidationError('Time range must be at least 1 minute', applyBtn, errorElement);
            return false;
        }

        const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
        if (startTime < tenYearsAgo) {
            this.showValidationError('Start time cannot be more than 10 years ago', applyBtn, errorElement);
            return false;
        }

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
                                this.timeFilter.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const endStr = this.timeFilter.end.toLocaleDateString() + ' ' + 
                              this.timeFilter.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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
        let translatedMessage = message;

        if (message === 'validLocationRequired' || message === 'invalidCoordinates' || message === 'invalidRadius') {
            translatedMessage = this.t(message);
        } else {
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
        const popup = document.getElementById('empty-results-popup');
        const message = popup.querySelector('p');
    
        // Update message based on active filter type
        if (this.activeFilterType === 'location') {
            if (message) {
                message.textContent = this.currentLanguage === 'es' 
                    ? 'No se encontraron ubicaciones en el área seleccionada.'
                    : 'No locations found in the selected area.';
            }
        } else {
            if (message) {
                message.textContent = this.t('noResultsMessage');
            }
        }
        popup.classList.add('show');
    }

    closeEmptyResultsPopup() {
        document.getElementById('empty-results-popup').classList.remove('show');
    }

    setQuickTimeRange(hours) {
        const now = new Date();
        const endTime = new Date(now);
        
        if (hours === 0) {
            const startTime = new Date(0);
            document.getElementById('start-time-popup').value = this.formatDateTimeLocal(startTime);
        } else {
            const startTime = new Date(now - hours * 60 * 60 * 1000);
            document.getElementById('start-time-popup').value = this.formatDateTimeLocal(startTime);
        }
        
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

        console.log('Applying time filter:', { start: startTime, end: endTime });

        this.timeFilter = { start: startTime, end: endTime };
        this.activeFilterType = 'time';
        this.locationFilter = null;
        console.log('timeFilter set to:', this.timeFilter);

        this.updateTimeFilterIndicator();
        this.loadHistoricalData();
        this.hideNoFilterOverlay();

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
            this.clearAllMarkers();
            this.clearTraceMarkers();
            this.routeCoords = [];
            this.updateRouteLine();
            this.displayFilteredLocations();

            setTimeout(() => {
                this.showNoFilterOverlay();
            }, 100);
        } else {
            this.loadInitialData();
        }

        document.getElementById('history-config-popup').classList.remove('active');
    }

    async loadHistoricalData() {
        if (!this.timeFilter) return;
        
        try {
            const startTimestamp = this.timeFilter.start.toISOString();
            const endTimestamp = this.timeFilter.end.toISOString();

            let url = `${this.config.apiBaseUrl}/api/locations/range?start=${startTimestamp}&end=${endTimestamp}`;
            if (this.selectedDevice) {
                url += `&device=${encodeURIComponent(this.selectedDevice)}`;
            }
        
            const response = await fetch(url);
            if (response.ok) {
                const locations = await response.json();
                this.filteredLocations = locations || [];

                this.clearAllMarkers();

                this.displayFilteredLocations();
                this.updateRouteForFiltered();

                if (this.filteredLocations.length > 0) {
                    this.fitMapToLocations(this.filteredLocations);
                } else {
                    setTimeout(() => this.showEmptyResultsPopup(), 500);
                }
            } else {
                console.error('Failed to load historical data:', response.status);
            }
        } catch (error) {
            console.error('Error loading historical data:', error);
            this.showError('Failed to load historical data');
        }
    }

    updateRouteForDevice() {
        if (this.selectedDevice) {
            this.routeCoords = this.locations
                .filter(loc => loc.device_id === this.selectedDevice)
                .map(loc => [loc.longitude, loc.latitude]);
        } else {
            this.routeCoords = this.locations.map(loc => [loc.longitude, loc.latitude]);
        }
        this.updateRouteLine();

        const locs = this.selectedDevice
            ? this.locations.filter(loc => loc.device_id === this.selectedDevice)
            : this.locations;

        this.clearTraceMarkers();

        if (this.isHistoryMode) {
            locs.forEach((loc, index) => {
                const isStart = index === locs.length - 1;
                const isEnd = index === 0;
                this.createTraceMarker(loc, isStart, isEnd);
            });
        } else {
            locs.forEach((loc, index) => {
                const isStart = index === locs.length - 1;
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

        this.routeCoords = this.filteredLocations.map(loc => [loc.longitude, loc.latitude]);
        this.updateRouteLine(); 

        this.clearTraceMarkers();

        this.filteredLocations.forEach((loc, index) => {
            const isStart = index === this.filteredLocations.length - 1;
            const isEnd = index === 0;
            this.createTraceMarker(loc, isStart, isEnd);
        });

        this.applyTraceDotsVisibility();
        this.updateRouteLegend();
    }
    
    async loadHistoricalByLocation(latitude, longitude, radiusKm = 0.5) {
        console.log('loadHistoricalByLocation called with:', { latitude, longitude, radiusKm });

        try {
            const url = `${this.config.apiBaseUrl}/api/locations/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`;
            console.log('Fetching from URL:', url);
        
            const response = await fetch(url);
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers); 

            if (response.ok) {
                const locations = await response.json();
                console.log('Received locations:', locations.length);
                console.log('First location:', locations[0]);   

                this.filteredLocations = locations || [];   

                this.locationFilter = { lat: latitude, lng: longitude, radius: radiusKm };
                this.activeFilterType = 'location';
                this.timeFilter = null;
                this.persistedTimeFilter = null;
                this.persistedLocationFilter = { ...this.locationFilter };
            
                this.clearAllMarkers();
                this.displayFilteredLocations();
                this.updateRouteForFiltered();
                this.updateTimeFilterIndicator();
                this.hideNoFilterOverlay();
            
                if (this.filteredLocations.length > 0) {
                    this.fitMapToLocations(this.filteredLocations);
                } else {
                    setTimeout(() => {
                        this.showEmptyResultsPopup();
                    }, 300);
                }
            } else {
                const errorText = await response.text();
                console.error('Failed to load location data:', response.status, errorText);
                this.showError('Failed to load location data: ' + response.status);
            }
        } catch (error) {
            console.error('Error loading location data:', error);
            this.showError('Failed to load location data: ' + error.message);
        }
    }
    
    startMapLocationSelection() {
        console.log('Starting map location selection');
        this.isSelectingLocationOnMap = true;
        
        this.map.getCanvas().style.cursor = 'crosshair';
        
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
        
        this.mapSelectionHandler = (e) => {
            const { lng, lat } = e.lngLat;
            console.log('Map clicked at:', { lat, lng });
            this.selectLocationFromMap(lat, lng);
        };

        this.map.once('click', this.mapSelectionHandler);
    }   

    cancelMapLocationSelection() {
        console.log('Canceling map location selection');
        this.isSelectingLocationOnMap = false;

        this.map.getCanvas().style.cursor = '';

        const instruction = document.getElementById('map-selection-instruction');
        if (instruction) instruction.remove();

        const cancelBtn = document.getElementById('map-selection-cancel');
        if (cancelBtn) cancelBtn.remove();

        if (this.mapSelectionHandler) {
            this.map.off('click', this.mapSelectionHandler);
            this.mapSelectionHandler = null;
        }
    }   

    selectLocationFromMap(lat, lng) {
        console.log('Location selected from map:', { lat, lng });
        
        document.getElementById('location-lat-input').value = lat.toFixed(6);
        document.getElementById('location-lng-input').value = lng.toFixed(6);
        
        this.cancelMapLocationSelection();
        
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
            
            this.lastActiveConfigTab = 'location-filter';
            this.openHistoryConfigPopup();
            
            setTimeout(() => {
                const latInput = document.getElementById('location-lat-input');
                if (latInput) {
                    latInput.dispatchEvent(new Event('input', { bubbles: true }));
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
                `Reconnecting in ${Math.ceil(delay/1000)}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 
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

                this.updateDevicesList();
                this.displayLocations();
                this.updateStatistics();

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
        
        if (this.isHistoryMode) {
            this.liveUpdateQueue.push(location);
            return;
        }
        this.applyLocationUpdate(location);
    }

    updateMapMarker(location, isLatest = false) {
        const deviceId = location.device_id;
        let marker = this.markers.get(deviceId);
        const popupContent = `
            <div style="font-family: system-ui; min-width: 200px;">
                <h4 style="margin: 0 0 10px 0; color: #374151;">${deviceId}</h4>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                    <strong>Coordinates:</strong><br>
                    ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
                </div>
                <div style="font-size: 12px; color: #6b7280;">
                    <strong>Time:</strong><br>
                    ${new Date(location.timestamp).toLocaleString()}
                </div>
            </div>
        `;
        
        if (!marker) {
            let el;
            if (isLatest) {
                el = document.createElement('div');
                el.className = 'pulse-marker';
            }
        
            marker = new maplibregl.Marker({
                element: el || undefined,
                color: isLatest ? undefined : this.getDeviceColor(deviceId)
            })
            .setLngLat([location.longitude, location.latitude])
            .setPopup(new maplibregl.Popup().setHTML(popupContent))
            .addTo(this.map);
        
            this.markers.set(deviceId, marker);
        } else {
            marker.setLngLat([location.longitude, location.latitude]);
            marker.setPopup(new maplibregl.Popup().setHTML(popupContent));
        }
    
        const el = marker.getElement();
        if (isLatest) {
            el.classList.add('pulse-marker');
            el.style.zIndex = "9999";
        } else {
            el.classList.remove('pulse-marker');
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

        this.devices.add(location.device_id);
        this.updateDevicesList();
        this.filterAndDisplayLocations();
        this.updateStatistics();

        if (this.selectedDevice === '' || this.selectedDevice === location.device_id) {
            this.updateMapMarker(location, !this.isHistoryMode);
            this.updateRouteForDevice();
            if (this.isTrackingLatest && !this.userInteracted) {
                this.centerMapOnLocation(location);
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
        this.userInteracted = false;

        this.suppressUserInteraction = true;

        this.map.flyTo({
            center: [location.longitude, location.latitude],
            zoom: Math.max(this.map.getZoom(), 12),
            duration: 800
        });

        this.map.once('moveend', () => {
            setTimeout(() => { this.suppressUserInteraction = false; }, 50);
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
                this.showSelectedLocationMarker(location);
            }
        } else {
            this.clearSelectedLocationMarker();
        }

        this.updateLocationSelection();
    }

    showSelectedLocationMarker(location) {
        this.clearSelectedLocationMarker();

        const popupContent = `
            <div style="font-family: system-ui; min-width: 200px;">
                <h4 style="margin: 0 0 10px 0; color: #374151;">${location.device_id} <span style="color: #f59e0b; font-size: 12px;">(SELECTED)</span></h4>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                    <strong>Coordinates:</strong><br>
                    ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
                </div>
                <div style="font-size: 12px; color: #6b7280;">
                    <strong>Time:</strong><br>
                    ${new Date(location.timestamp).toLocaleString()}
                </div>
                <button onclick="locationTracker.clearSelectedLocation()" style="margin-top: 10px; background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    Clear Selection
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

    clearSelectedLocation() {
        this.selectedLocationIndex = -1;
        this.clearSelectedLocationMarker();
        this.updateLocationSelection();
        if (!this.userInteracted) {
            this.toggleTracking(true);
        }
    }

    getFilteredLocations() {
        if (this.selectedDevice) {
            return this.locations.filter(loc => loc.device_id === this.selectedDevice);
        }
        return this.locations;
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

    updateDevicesList() {
        const select = document.getElementById('device-filter');
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">All Devices</option>';
        
        Array.from(this.devices).sort().forEach(deviceId => {
            const option = document.createElement('option');
            option.value = deviceId;
            option.textContent = deviceId;
            select.appendChild(option);
        });
        
        select.value = currentValue;
    }

    filterAndDisplayLocations() {
        let filteredLocations = this.getFilteredLocations();
        this.displayLocations(filteredLocations);
    }

    displayLocations(locations = this.locations) {
        const container = document.getElementById('location-list');

        if (locations.length === 0) {
            container.innerHTML = `<div class="loading">${this.t('noLocationsFound')}</div>`;
            return;
        }

        container.innerHTML = locations.slice(0, this.historyLimit).map((location, index) => `
            <div class="location-item ${index === 0 ? 'latest' : ''} ${index === this.selectedLocationIndex ? 'selected' : ''}" 
                 onclick="locationTracker.selectLocation(${index})">
                <div class="device-id">${location.device_id}</div>
                <div class="coordinates">${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}</div>
                <div class="timestamp">${new Date(location.timestamp).toLocaleString()}</div>
            </div>
        `).join('');
        
        const orphanedButtons = container.querySelectorAll('.quick-range-btn');
        orphanedButtons.forEach(btn => btn.remove());
    }

    displayFilteredLocations() {
        const container = document.getElementById('location-list');

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

        let translatedMessage = message;
        const translations = {
            'Connected': this.t('connected'),
            'Connecting...': this.t('connecting'),
            'Disconnected': this.t('disconnected'),
            'Connection Error': this.t('connectionError'),
            'Connection failed - refresh page': this.t('connectionFailed')
        };

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

    showError(message) {
        const container = document.getElementById('location-list');
        container.innerHTML = `<div class="error">${message}</div>`;
    }

    async refreshData() {
        try {
            if (this.isHistoryMode && this.timeFilter) {
                await this.loadHistoricalData();
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
