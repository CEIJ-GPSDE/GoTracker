package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
  _ "github.com/paulmach/orb"
  _ "github.com/paulmach/orb/encoding/wkt"
  _ "github.com/paulmach/orb/geojson"
)

// ========== CONFIGURACIÓN DE ENCRIPTACIÓN ==========
// La clave AES-128 se lee desde variable de entorno
var aesKey []byte

func initEncryption() error {
	// Leer la clave desde variable de entorno
	aesKeyHex := os.Getenv("AES_KEY")
	if aesKeyHex == "" {
		return fmt.Errorf("AES_KEY requerida pero no encontrada")
	}

	var err error
	aesKey, err = hex.DecodeString(aesKeyHex)
	if err != nil {
		return fmt.Errorf("error decodificando clave AES: %w", err)
	}
	if len(aesKey) != 16 {
		return fmt.Errorf("la clave AES debe ser de 16 bytes, obtenido: %d", len(aesKey))
	}
	log.Printf("✅ Clave AES-128-GCM inicializada correctamente")
	return nil
}

// Descifra un paquete AES-GCM
// Formato esperado: [IV(12 bytes)] + [Ciphertext(N bytes)] + [Tag(16 bytes)]
func decryptPacket(encryptedData []byte) ([]byte, error) {
	// Validar tamaño mínimo: IV(12) + Tag(16) = 28 bytes
	if len(encryptedData) < 28 {
		return nil, fmt.Errorf("paquete demasiado pequeño: %d bytes (mínimo 28)", len(encryptedData))
	}

	// Extraer componentes
	iv := encryptedData[:12]
	tag := encryptedData[len(encryptedData)-16:]
	ciphertext := encryptedData[12 : len(encryptedData)-16]

	log.Printf("Descifrando: IV=%d bytes, Ciphertext=%d bytes, Tag=%d bytes",
		len(iv), len(ciphertext), len(tag))

	// Crear cipher AES
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return nil, fmt.Errorf("error creando cipher AES: %w", err)
	}

	// Crear GCM
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("error creando GCM: %w", err)
	}

	// Combinar ciphertext + tag para Open
	combined := append(ciphertext, tag...)

	// Descifrar
	plaintext, err := aesgcm.Open(nil, iv, combined, nil)
	if err != nil {
		return nil, fmt.Errorf("error descifrando (tag inválido o datos corruptos): %w", err)
	}

	return plaintext, nil
}

// ========== RESTO DEL CÓDIGO ORIGINAL ==========

// Configuration from environment variables
type Config struct {
	DBHost      string
	DBName      string
	DBUser      string
	DBPassword  string
	DBSSLMode   string
	Port        string
	UDPPort     string
	LogFile     string
	CertFile    string
	KeyFile     string
	TablePrefix string
}

func loadConfig() *Config {
	return &Config{
		DBHost:      getEnv("DB_HOST", "localhost"),
		DBName:      getEnv("DB_NAME", "locationtracker"),
		DBUser:      getEnv("DB_USER", "postgres"),
		DBPassword:  getEnv("DB_PASSWORD", "password"),
		DBSSLMode:   getEnv("DB_SSLMODE", "disable"),
		Port:        getEnv("PORT", "80"),
		UDPPort:     getEnv("UDP_PORT", "5051"),
		LogFile:     getEnv("LOG_FILE", ""),
		CertFile:    getEnv("CERT_FILE", "certs/server.crt"),
		KeyFile:     getEnv("KEY_FILE", "certs/server.key"),
		TablePrefix: getEnv("TABLE_PREFIX", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Database wrapper
type Database struct {
	*sql.DB
}

func NewDatabase(config *Config) (*Database, error) {
	connStr := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s sslmode=%s",
		config.DBHost, config.DBUser, config.DBPassword,
		config.DBName, config.DBSSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)
	return &Database{db}, nil
}

func (db *Database) InitializeSchema(prefix string) error {
    tableName := "locations"
    if prefix != "" {
        tableName = prefix + "_locations"
    }

    // Enable PostGIS
    _, err := db.Exec(`CREATE EXTENSION IF NOT EXISTS postgis;`)
    if err != nil {
        log.Printf("Warning: Could not create PostGIS extension: %v", err)
    }

    // Check if table exists with old schema
    var hasLatColumn bool
    err = db.QueryRow(fmt.Sprintf(`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = '%s' AND column_name = 'latitude'
        )
    `, tableName)).Scan(&hasLatColumn)
    
    if err == nil && hasLatColumn {
        log.Printf("⚠️  Old schema detected for %s, migrating to PostGIS...", tableName)
        
        // Backup data if any exists
        var count int
        db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", tableName)).Scan(&count)
        
        if count > 0 {
            log.Printf("📦 Backing up %d records...", count)
            _, err = db.Exec(fmt.Sprintf(`
                CREATE TEMP TABLE %s_backup AS SELECT * FROM %s
            `, tableName, tableName))
            if err != nil {
                return fmt.Errorf("failed to backup data: %w", err)
            }
        }
        
        // Drop old table
        log.Printf("🗑️  Dropping old table...")
        _, err = db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", tableName))
        if err != nil {
            return fmt.Errorf("failed to drop old table: %w", err)
        }
    }

    // Create new schema with PostGIS
    schema := fmt.Sprintf(`
    -- Locations table with PostGIS
    CREATE TABLE IF NOT EXISTS %s (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        location GEOGRAPHY(POINT, 4326) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_%s_geography ON %s USING GIST(location);
    CREATE INDEX IF NOT EXISTS idx_%s_timestamp ON %s(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_%s_device_timestamp ON %s(device_id, timestamp DESC);
    
    -- ... rest of your schema ...
    `, tableName, tableName, tableName, tableName, tableName, tableName, tableName)

    _, err = db.Exec(schema)
    if err != nil {
        return err
    }
    
    // Restore data if we had a backup
    var backupExists bool
    db.QueryRow(fmt.Sprintf(`
        SELECT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = '%s_backup'
        )
    `, tableName)).Scan(&backupExists)
    
    if backupExists {
        log.Printf("📥 Restoring backed up data...")
        _, err = db.Exec(fmt.Sprintf(`
            INSERT INTO %s (device_id, location, timestamp, created_at)
            SELECT device_id, 
                   ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                   timestamp,
                   created_at
            FROM %s_backup
        `, tableName, tableName))
        if err != nil {
            log.Printf("⚠️  Failed to restore data: %v", err)
        } else {
            log.Printf("✅ Data restored successfully")
        }
    }
    
    log.Printf("✅ Schema initialized for table: %s", tableName)
    return nil
}

// Location data structure
type LocationPacket struct {
	DeviceID  string    `json:"device_id"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Timestamp time.Time `json:"timestamp"`
}

type Geofence struct {
    ID          int       `json:"id"`
    Name        string    `json:"name"`
    Description string    `json:"description"`
    Coordinates [][]float64 `json:"coordinates"` // [[lng, lat], [lng, lat], ...]
    Active      bool      `json:"active"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}

type Route struct {
    ID            int         `json:"id"`
    DeviceID      string      `json:"device_id"`
    RouteName     string      `json:"route_name"`
    Coordinates   [][]float64 `json:"coordinates"` // [[lng, lat], [lng, lat], ...]
    StartTime     time.Time   `json:"start_time"`
    EndTime       time.Time   `json:"end_time"`
    DistanceMeters float64    `json:"distance_meters"`
    CreatedAt     time.Time   `json:"created_at"`
}

// WebSocket Hub for real-time updates
type WebSocketHub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan interface{}
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mutex      sync.RWMutex
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Configure properly for production
	},
}

func NewWebSocketHub() *WebSocketHub {
	return &WebSocketHub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan interface{}, 256),
		register:   make(chan *websocket.Conn, 256),
		unregister: make(chan *websocket.Conn, 256),
	}
}

func (h *WebSocketHub) Run(ctx context.Context) {
	log.Println("Starting WebSocket hub")
	for {
		select {
		case <-ctx.Done():
			h.closeAllClients()
			return
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
			log.Printf("WebSocket client connected. Total clients: %d", len(h.clients))

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Close()
			}
			h.mutex.Unlock()
			log.Printf("WebSocket client disconnected. Total clients: %d", len(h.clients))

		case data := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case <-ctx.Done():
					h.mutex.RUnlock()
					return
				default:
					if err := client.WriteJSON(data); err != nil {
						log.Printf("WebSocket write error: %v", err)
						client.Close()
						delete(h.clients, client)
					}
				}
			}
			h.mutex.RUnlock()
		}
	}
}

func (h *WebSocketHub) closeAllClients() {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	for client := range h.clients {
		client.Close()
	}
	h.clients = make(map[*websocket.Conn]bool)
}

func (h *WebSocketHub) ClientCount() int {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return len(h.clients)
}

func (h *WebSocketHub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	h.register <- conn

	// Handle client messages
	go func() {
		defer func() {
			h.unregister <- conn
		}()

		for {
			messageType, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket unexpected close error: %v", err)
				}
				break
			}

			// Handle ping-pong messages
			if messageType == websocket.TextMessage {
				messageStr := string(message)
				if messageStr == "ping" {
					// Respond with pong
					err = conn.WriteMessage(websocket.TextMessage, []byte("pong"))
					if err != nil {
						log.Printf("WebSocket pong write error: %v", err)
						break
					}
					continue
				}
			}
		}
	}()

	// Send initial ping to establish connection
	go func() {
		time.Sleep(2 * time.Second) // Wait a bit before first ping
		err := conn.WriteMessage(websocket.TextMessage, []byte("ping"))
		if err != nil {
			log.Printf("Initial ping failed: %v", err)
		}
	}()
}

func (h *WebSocketHub) Broadcast(data interface{}) {
	select {
	case h.broadcast <- data:
	default:
		log.Println("WebSocket broadcast channel full, dropping message")
	}
}

// UDP Sniffer - MODIFICADO PARA DESCIFRADO
type UDPSniffer struct {
	db          *Database
	wsHub       *WebSocketHub
	port        string
	tablePrefix string
}

func NewUDPSniffer(db *Database, wsHub *WebSocketHub, port string, tablePrefix string) *UDPSniffer {
	return &UDPSniffer{
		db:          db,
		wsHub:       wsHub,
		port:        port,
		tablePrefix: tablePrefix,
	}
}

func (us *UDPSniffer) Run(ctx context.Context) {
	log.Println("Starting UDP sniffer service with AES-GCM decryption")

	addr, err := net.ResolveUDPAddr("udp", ":"+us.port)
	if err != nil {
		log.Printf("Error resolving UDP address: %v", err)
		return
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Printf("Error starting UDP listener: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("✓ UDP listening on port %s (AES-GCM encrypted)", us.port)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			conn.SetReadDeadline(time.Now().Add(2 * time.Second))
			buffer := make([]byte, 1024)
			n, addr, err := conn.ReadFromUDP(buffer)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue // Timeout is expected
				}
				log.Printf("UDP read error: %v", err)
				continue
			}

			// ✅ Log del paquete encriptado recibido
			log.Printf("📦 Received encrypted packet from %s (%d bytes)", addr, n)
			log.Printf("   Hex: %s", hex.EncodeToString(buffer[:n]))

			// ✅ Descifrar el paquete
			plaintext, err := decryptPacket(buffer[:n])
			if err != nil {
				log.Printf("❌ Decryption failed: %v", err)
				continue
			}

			log.Printf("✓ Decrypted: %s", string(plaintext))

			// ✅ Parsear el mensaje descifrado
			packet := us.parsePacket(plaintext)
			if packet != nil {
				if err := us.storeLocation(packet); err != nil {
					log.Printf("Error storing location: %v", err)
				} else {
					us.wsHub.Broadcast(packet)
					log.Printf("✓ Stored location: Device=%s, Lat=%.6f, Lng=%.6f",
						packet.DeviceID, packet.Latitude, packet.Longitude)
				}
			}
		}
	}
}

func (us *UDPSniffer) parsePacket(data []byte) *LocationPacket {
	parts := strings.TrimSpace(string(data))
	fields := strings.Split(parts, ",")
	if len(fields) != 3 {
		log.Printf("Invalid packet format: %s", parts)
		return nil
	}

	deviceID := fields[0]
	lat, err1 := strconv.ParseFloat(fields[1], 64)
	lng, err2 := strconv.ParseFloat(fields[2], 64)
	if err1 != nil || err2 != nil {
		log.Printf("Invalid coordinates: %s", parts)
		return nil
	}

	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		log.Printf("Out-of-range coordinates: lat=%f, lng=%f", lat, lng)
		return nil
	}

	return &LocationPacket{
		DeviceID:  deviceID,
		Latitude:  lat,
		Longitude: lng,
		Timestamp: time.Now(),
	}
}

func (us *UDPSniffer) storeLocation(packet *LocationPacket) error {
    tableName := "locations"
    if us.tablePrefix != "" {
        tableName = us.tablePrefix + "_locations"
    }

    // Use ST_SetSRID and ST_MakePoint for PostGIS
    query := fmt.Sprintf(`
        INSERT INTO %s (device_id, location, timestamp)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
    `, tableName)
    
    _, err := us.db.Exec(query, 
        packet.DeviceID, 
        packet.Longitude,  // X coordinate (longitude)
        packet.Latitude,   // Y coordinate (latitude)
        packet.Timestamp,
    )
    return err
}

// API Server - SIN CAMBIOS
type APIServer struct {
	db          *Database
	wsHub       *WebSocketHub
	server      *http.Server
	port        string
	tablePrefix string
}

func NewAPIServer(db *Database, wsHub *WebSocketHub, port string, tablePrefix string) *APIServer {
	return &APIServer{
		db:          db,
		wsHub:       wsHub,
		port:        port,
		tablePrefix: tablePrefix,
		server: &http.Server{
			Addr:         ":" + port,
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 15 * time.Second,
		},
	}
}

func (api *APIServer) Run(ctx context.Context) {
	r := mux.NewRouter().StrictSlash(true)

	// Apply CORS middleware first
	r.Use(corsMiddleware)

	// WebSocket route
	r.HandleFunc("/ws", api.wsHub.HandleWebSocket)

	// API routes (MUST come before static files)
	r.HandleFunc("/api/devices", api.activeDevicesHandler).Methods("GET")
	r.HandleFunc("/api/health", api.healthHandler).Methods("GET")
	r.HandleFunc("/api/health/db", api.dbHealthHandler).Methods("GET")
	r.HandleFunc("/api/locations/latest", api.latestLocationHandler).Methods("GET")
	r.HandleFunc("/api/locations/history", api.locationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/locations/range", api.locationRangeHandler).Methods("GET")
	r.HandleFunc("/api/locations/nearby", api.locationNearbyHandler).Methods("GET")
	r.HandleFunc("/api/locations/device/{deviceId}", api.deviceLocationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/stats", api.statsHandler).Methods("GET")

	// Geofence routes
	r.HandleFunc("/api/geofences", api.getGeofencesHandler).Methods("GET")
	r.HandleFunc("/api/geofences", api.createGeofenceHandler).Methods("POST")
	r.HandleFunc("/api/geofences/{id}", api.getGeofenceHandler).Methods("GET")
	r.HandleFunc("/api/geofences/{id}", api.updateGeofenceHandler).Methods("PUT")
	r.HandleFunc("/api/geofences/{id}", api.deleteGeofenceHandler).Methods("DELETE")
	r.HandleFunc("/api/geofence/check", api.geofenceCheckHandler).Methods("GET")
	r.HandleFunc("/api/distance", api.distanceHandler).Methods("GET")
   
	// Route routes
	r.HandleFunc("/api/routes", api.getRoutesHandler).Methods("GET")
	r.HandleFunc("/api/routes", api.createRouteHandler).Methods("POST")
	r.HandleFunc("/api/routes/{id}", api.deleteRouteHandler).Methods("DELETE")

	// Static file serving (MUST be last)
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))

	api.server.Handler = r

	go func() {
		log.Printf("API server starting on port %s", api.server.Addr)
		if err := api.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("API server error: %v", err)
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := api.server.Shutdown(shutdownCtx); err != nil {
		log.Printf("API server shutdown error: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (api *APIServer) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now(),
	})
}

func (api *APIServer) dbHealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	err := api.db.Ping()
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unhealthy",
			"error":  err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now(),
	})
}

func (api *APIServer) statsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	var totalLocations int
	var activeDevices int
	var lastUpdate sql.NullTime

	err := api.db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", tableName)).Scan(&totalLocations)
	if err != nil {
		log.Printf("Error counting locations: %v", err)
	}

	err = api.db.QueryRow(fmt.Sprintf("SELECT COUNT(DISTINCT device_id) FROM %s", tableName)).Scan(&activeDevices)
	if err != nil {
		log.Printf("Error counting active devices: %v", err)
	}

	err = api.db.QueryRow(fmt.Sprintf("SELECT MAX(timestamp) FROM %s", tableName)).Scan(&lastUpdate)
	if err != nil {
		log.Printf("Error getting last update: %v", err)
	}

	var lastUpdateStr string
	if lastUpdate.Valid {
		lastUpdateStr = lastUpdate.Time.Format(time.RFC3339)
	} else {
		lastUpdateStr = ""
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"connected_clients": api.wsHub.ClientCount(),
		"total_locations":   totalLocations,
		"active_devices":    activeDevices,
		"last_update":       lastUpdateStr,
	})
}

func (api *APIServer) latestLocationHandler(w http.ResponseWriter, r *http.Request) {
	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	query := fmt.Sprintf(`
		SELECT device_id, 
		       ST_Y(location::geometry) as latitude,
		       ST_X(location::geometry) as longitude,
		       timestamp
		FROM %s
		ORDER BY timestamp DESC
		LIMIT 1
	`, tableName)

	var location LocationPacket
	err := api.db.QueryRow(query).Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "No locations found", http.StatusNotFound)
		} else {
			http.Error(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(location)
}

func (api *APIServer) locationHistoryHandler(w http.ResponseWriter, r *http.Request) {
	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "100"
	}

	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt <= 0 || limitInt > 1000 {
		http.Error(w, "Invalid limit parameter", http.StatusBadRequest)
		return
	}

	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	query := fmt.Sprintf(`
		SELECT device_id,
		       ST_Y(location::geometry) as latitude,
		       ST_X(location::geometry) as longitude,
		       timestamp
		FROM %s
		ORDER BY timestamp DESC
		LIMIT $1
	`, tableName)

	rows, err := api.db.Query(query, limitInt)
	if err != nil {
		log.Printf("Database query error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var locations []LocationPacket
	for rows.Next() {
		var location LocationPacket
		if err := rows.Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp); err != nil {
			log.Printf("Row scan error: %v", err)
			continue
		}
		locations = append(locations, location)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows iteration error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if locations == nil {
		locations = []LocationPacket{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func (api *APIServer) locationRangeHandler(w http.ResponseWriter, r *http.Request) {
	startTimeStr := r.URL.Query().Get("start")
	endTimeStr := r.URL.Query().Get("end")
	deviceIDs := r.URL.Query()["device"]

	if startTimeStr == "" || endTimeStr == "" {
		http.Error(w, "start and end parameters are required", http.StatusBadRequest)
		return
	}

	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		http.Error(w, "Invalid start time format, use RFC3339", http.StatusBadRequest)
		return
	}

	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		http.Error(w, "Invalid end time format, use RFC3339", http.StatusBadRequest)
		return
	}

	if startTime.After(endTime) {
		http.Error(w, "Start time must be before end time", http.StatusBadRequest)
		return
	}

	maxDuration := 365 * 24 * time.Hour
	if endTime.Sub(startTime) > maxDuration {
		http.Error(w, "Time range too large, maximum 365 days", http.StatusBadRequest)
		return
	}

	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	var query string
	var args []interface{}

	if len(deviceIDs) > 0 {
		placeholders := make([]string, len(deviceIDs))
		args = append(args, startTime, endTime)
		for i, deviceID := range deviceIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+3)
			args = append(args, deviceID)
		}

		query = fmt.Sprintf(`
			SELECT device_id,
			       ST_Y(location::geometry) as latitude,
			       ST_X(location::geometry) as longitude,
			       timestamp
			FROM %s
			WHERE timestamp >= $1 AND timestamp <= $2 AND device_id IN (%s)
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName, strings.Join(placeholders, ","))
	} else {
		query = fmt.Sprintf(`
			SELECT device_id,
			       ST_Y(location::geometry) as latitude,
			       ST_X(location::geometry) as longitude,
			       timestamp
			FROM %s
			WHERE timestamp >= $1 AND timestamp <= $2
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName)
		args = []interface{}{startTime, endTime}
	}

	rows, err := api.db.Query(query, args...)
	if err != nil {
		log.Printf("Database query error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var locations []LocationPacket
	for rows.Next() {
		var location LocationPacket
		if err := rows.Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp); err != nil {
			log.Printf("Row scan error: %v", err)
			continue
		}
		locations = append(locations, location)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows iteration error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if locations == nil {
		locations = []LocationPacket{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func (api *APIServer) locationNearbyHandler(w http.ResponseWriter, r *http.Request) {
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	radiusStr := r.URL.Query().Get("radius")
	deviceIDs := r.URL.Query()["device"]

	if latStr == "" || lngStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "lat and lng parameters are required",
		})
		return
	}

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat < -90 || lat > 90 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid latitude",
		})
		return
	}

	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng < -180 || lng > 180 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid longitude",
		})
		return
	}

	radius := 0.5 // default 500m
	if radiusStr != "" {
		radius, err = strconv.ParseFloat(radiusStr, 64)
		if err != nil || radius <= 0 || radius > 50 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid radius (must be between 0 and 50 km)",
			})
			return
		}
	}

	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	// Use PostGIS ST_DWithin for efficient spatial query
	var query string
	var args []interface{}
	radiusMeters := radius * 1000 // Convert km to meters

	if len(deviceIDs) > 0 {
		placeholders := make([]string, len(deviceIDs))
		args = append(args, lng, lat, radiusMeters)
		for i, deviceID := range deviceIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+4)
			args = append(args, deviceID)
		}

		query = fmt.Sprintf(`
			SELECT device_id,
			       ST_Y(location::geometry) as latitude,
			       ST_X(location::geometry) as longitude,
			       timestamp
			FROM %s
			WHERE ST_DWithin(
				location,
				ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
				$3
			)
			AND device_id IN (%s)
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName, strings.Join(placeholders, ","))
	} else {
		query = fmt.Sprintf(`
			SELECT device_id,
			       ST_Y(location::geometry) as latitude,
			       ST_X(location::geometry) as longitude,
			       timestamp
			FROM %s
			WHERE ST_DWithin(
				location,
				ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
				$3
			)
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName)
		args = []interface{}{lng, lat, radiusMeters}
	}

	rows, err := api.db.Query(query, args...)
	if err != nil {
		log.Printf("Database query error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var locations []LocationPacket
	for rows.Next() {
		var location LocationPacket
		if err := rows.Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp); err != nil {
			log.Printf("Row scan error: %v", err)
			continue
		}
		locations = append(locations, location)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows iteration error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func (api *APIServer) activeDevicesHandler(w http.ResponseWriter, r *http.Request) {
	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	query := fmt.Sprintf(`
        SELECT DISTINCT device_id, 
               MAX(timestamp) as last_seen,
               COUNT(*) as location_count
        FROM %s
        GROUP BY device_id
        ORDER BY last_seen DESC
    `, tableName)

	rows, err := api.db.Query(query)
	if err != nil {
		log.Printf("Database query error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type DeviceInfo struct {
		DeviceID      string    `json:"device_id"`
		LastSeen      time.Time `json:"last_seen"`
		LocationCount int       `json:"location_count"`
	}

	var devices []DeviceInfo
	for rows.Next() {
		var device DeviceInfo
		if err := rows.Scan(&device.DeviceID, &device.LastSeen, &device.LocationCount); err != nil {
			log.Printf("Row scan error: %v", err)
			continue
		}
		devices = append(devices, device)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows iteration error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if devices == nil {
		devices = []DeviceInfo{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices)
}

func (api *APIServer) deviceLocationHistoryHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	deviceId := vars["deviceId"]

	if deviceId == "" {
		http.Error(w, "Device ID is required", http.StatusBadRequest)
		return
	}

	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "50"
	}

	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt <= 0 || limitInt > 1000 {
		http.Error(w, "Invalid limit parameter", http.StatusBadRequest)
		return
	}

	tableName := "locations"
	if api.tablePrefix != "" {
		tableName = api.tablePrefix + "_locations"
	}

	query := fmt.Sprintf(`
		SELECT device_id,
		       ST_Y(location::geometry) as latitude,
		       ST_X(location::geometry) as longitude,
		       timestamp
		FROM %s
		WHERE device_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`, tableName)

	rows, err := api.db.Query(query, deviceId, limitInt)
	if err != nil {
		log.Printf("Database query error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var locations []LocationPacket
	for rows.Next() {
		var location LocationPacket
		if err := rows.Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp); err != nil {
			log.Printf("Row scan error: %v", err)
			continue
		}
		locations = append(locations, location)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Rows iteration error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if locations == nil {
		locations = []LocationPacket{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func (api *APIServer) createGeofenceHandler(w http.ResponseWriter, r *http.Request) {
    var input struct {
        Name        string      `json:"name"`
        Description string      `json:"description"`
        Coordinates [][]float64 `json:"coordinates"` // Array of [lng, lat]
    }

    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    // Validate
    if input.Name == "" {
        http.Error(w, "Name is required", http.StatusBadRequest)
        return
    }

    if len(input.Coordinates) < 3 {
        http.Error(w, "At least 3 coordinates required for a polygon", http.StatusBadRequest)
        return
    }

    // Close the polygon if not already closed
    firstPoint := input.Coordinates[0]
    lastPoint := input.Coordinates[len(input.Coordinates)-1]
    if firstPoint[0] != lastPoint[0] || firstPoint[1] != lastPoint[1] {
        input.Coordinates = append(input.Coordinates, firstPoint)
    }

    // Build WKT string for polygon
    var wktPoints []string
    for _, coord := range input.Coordinates {
        wktPoints = append(wktPoints, fmt.Sprintf("%f %f", coord[0], coord[1]))
    }
    wkt := fmt.Sprintf("POLYGON((%s))", strings.Join(wktPoints, ", "))

    query := `
        INSERT INTO geofences (name, description, geom, active)
        VALUES ($1, $2, ST_GeogFromText($3), true)
        RETURNING id, created_at, updated_at
    `

    var geofence Geofence
    err := api.db.QueryRow(query, input.Name, input.Description, wkt).Scan(
        &geofence.ID, &geofence.CreatedAt, &geofence.UpdatedAt,
    )

    if err != nil {
        log.Printf("Error creating geofence: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    geofence.Name = input.Name
    geofence.Description = input.Description
    geofence.Coordinates = input.Coordinates
    geofence.Active = true

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(geofence)
}

func (api *APIServer) getGeofencesHandler(w http.ResponseWriter, r *http.Request) {
    activeOnly := r.URL.Query().Get("active") == "true"

    query := `
        SELECT id, name, description, 
               ST_AsGeoJSON(geom::geometry) as geom_json,
               active, created_at, updated_at
        FROM geofences
    `

    if activeOnly {
        query += " WHERE active = true"
    }

    query += " ORDER BY created_at DESC"

    rows, err := api.db.Query(query)
    if err != nil {
        log.Printf("Error querying geofences: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    var geofences []Geofence
    for rows.Next() {
        var gf Geofence
        var geomJSON string

        if err := rows.Scan(&gf.ID, &gf.Name, &gf.Description, &geomJSON, 
                           &gf.Active, &gf.CreatedAt, &gf.UpdatedAt); err != nil {
            continue
        }

        // Parse GeoJSON to extract coordinates
        var geoJSON map[string]interface{}
        if err := json.Unmarshal([]byte(geomJSON), &geoJSON); err == nil {
            if coords, ok := geoJSON["coordinates"].([]interface{}); ok {
                if polygon, ok := coords[0].([]interface{}); ok {
                    for _, point := range polygon {
                        if pt, ok := point.([]interface{}); ok && len(pt) >= 2 {
                            lng, _ := pt[0].(float64)
                            lat, _ := pt[1].(float64)
                            gf.Coordinates = append(gf.Coordinates, []float64{lng, lat})
                        }
                    }
                }
            }
        }

        geofences = append(geofences, gf)
    }

    if geofences == nil {
        geofences = []Geofence{}
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(geofences)
}

// Get a single geofence by ID
func (api *APIServer) getGeofenceHandler(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    geofenceID := vars["id"]

    query := `
        SELECT id, name, description, 
               ST_AsGeoJSON(geom::geometry) as geom_json,
               active, created_at, updated_at
        FROM geofences
        WHERE id = $1
    `

    var gf Geofence
    var geomJSON string

    err := api.db.QueryRow(query, geofenceID).Scan(
        &gf.ID, &gf.Name, &gf.Description, &geomJSON,
        &gf.Active, &gf.CreatedAt, &gf.UpdatedAt,
    )

    if err == sql.ErrNoRows {
        http.Error(w, "Geofence not found", http.StatusNotFound)
        return
    } else if err != nil {
        log.Printf("Error querying geofence: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    // Parse GeoJSON
    var geoJSON map[string]interface{}
    if err := json.Unmarshal([]byte(geomJSON), &geoJSON); err == nil {
        if coords, ok := geoJSON["coordinates"].([]interface{}); ok {
            if polygon, ok := coords[0].([]interface{}); ok {
                for _, point := range polygon {
                    if pt, ok := point.([]interface{}); ok && len(pt) >= 2 {
                        lng, _ := pt[0].(float64)
                        lat, _ := pt[1].(float64)
                        gf.Coordinates = append(gf.Coordinates, []float64{lng, lat})
                    }
                }
            }
        }
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(gf)
}

// Update geofence
func (api *APIServer) updateGeofenceHandler(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    geofenceID := vars["id"]

    var input struct {
        Name        *string      `json:"name"`
        Description *string      `json:"description"`
        Coordinates [][]float64  `json:"coordinates"`
        Active      *bool        `json:"active"`
    }

    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    updates := []string{}
    args := []interface{}{}
    argIdx := 1

    if input.Name != nil {
        updates = append(updates, fmt.Sprintf("name = $%d", argIdx))
        args = append(args, *input.Name)
        argIdx++
    }

    if input.Description != nil {
        updates = append(updates, fmt.Sprintf("description = $%d", argIdx))
        args = append(args, *input.Description)
        argIdx++
    }

    if input.Coordinates != nil && len(input.Coordinates) >= 3 {
        // Close polygon if needed
        firstPoint := input.Coordinates[0]
        lastPoint := input.Coordinates[len(input.Coordinates)-1]
        if firstPoint[0] != lastPoint[0] || firstPoint[1] != lastPoint[1] {
            input.Coordinates = append(input.Coordinates, firstPoint)
        }

        var wktPoints []string
        for _, coord := range input.Coordinates {
            wktPoints = append(wktPoints, fmt.Sprintf("%f %f", coord[0], coord[1]))
        }
        wkt := fmt.Sprintf("POLYGON((%s))", strings.Join(wktPoints, ", "))

        updates = append(updates, fmt.Sprintf("geom = ST_GeogFromText($%d)", argIdx))
        args = append(args, wkt)
        argIdx++
    }

    if input.Active != nil {
        updates = append(updates, fmt.Sprintf("active = $%d", argIdx))
        args = append(args, *input.Active)
        argIdx++
    }

    if len(updates) == 0 {
        http.Error(w, "No fields to update", http.StatusBadRequest)
        return
    }

    updates = append(updates, "updated_at = NOW()")
    args = append(args, geofenceID)

    query := fmt.Sprintf(`
        UPDATE geofences
        SET %s
        WHERE id = $%d
        RETURNING id, name, description, active, created_at, updated_at
    `, strings.Join(updates, ", "), argIdx)

    var gf Geofence
    err := api.db.QueryRow(query, args...).Scan(
        &gf.ID, &gf.Name, &gf.Description, &gf.Active, &gf.CreatedAt, &gf.UpdatedAt,
    )

    if err == sql.ErrNoRows {
        http.Error(w, "Geofence not found", http.StatusNotFound)
        return
    } else if err != nil {
        log.Printf("Error updating geofence: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    if input.Coordinates != nil {
        gf.Coordinates = input.Coordinates
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(gf)
}

// Delete geofence
func (api *APIServer) deleteGeofenceHandler(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    geofenceID := vars["id"]

    result, err := api.db.Exec("DELETE FROM geofences WHERE id = $1", geofenceID)
    if err != nil {
        log.Printf("Error deleting geofence: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    rowsAffected, _ := result.RowsAffected()
    if rowsAffected == 0 {
        http.Error(w, "Geofence not found", http.StatusNotFound)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

// Check which geofences contain a point
func (api *APIServer) geofenceCheckHandler(w http.ResponseWriter, r *http.Request) {
    latStr := r.URL.Query().Get("lat")
    lngStr := r.URL.Query().Get("lng")

    if latStr == "" || lngStr == "" {
        http.Error(w, "lat and lng parameters required", http.StatusBadRequest)
        return
    }

    lat, err1 := strconv.ParseFloat(latStr, 64)
    lng, err2 := strconv.ParseFloat(lngStr, 64)

    if err1 != nil || err2 != nil {
        http.Error(w, "Invalid coordinates", http.StatusBadRequest)
        return
    }

    query := `
        SELECT id, name, description,
               ST_AsGeoJSON(geom::geometry) as geom_json,
               active
        FROM geofences
        WHERE active = true
          AND ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
    `

    rows, err := api.db.Query(query, lng, lat)
    if err != nil {
        log.Printf("Database error: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    var geofences []Geofence
    for rows.Next() {
        var gf Geofence
        var geomJSON string

        if err := rows.Scan(&gf.ID, &gf.Name, &gf.Description, &geomJSON, &gf.Active); err != nil {
            continue
        }

        // Parse GeoJSON
        var geoJSON map[string]interface{}
        if err := json.Unmarshal([]byte(geomJSON), &geoJSON); err == nil {
            if coords, ok := geoJSON["coordinates"].([]interface{}); ok {
                if polygon, ok := coords[0].([]interface{}); ok {
                    for _, point := range polygon {
                        if pt, ok := point.([]interface{}); ok && len(pt) >= 2 {
                            lng, _ := pt[0].(float64)
                            lat, _ := pt[1].(float64)
                            gf.Coordinates = append(gf.Coordinates, []float64{lng, lat})
                        }
                    }
                }
            }
        }

        geofences = append(geofences, gf)
    }

    if geofences == nil {
        geofences = []Geofence{}
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "point":     []float64{lng, lat},
        "geofences": geofences,
        "count":     len(geofences),
    })
}

// Get routes
func (api *APIServer) getRoutesHandler(w http.ResponseWriter, r *http.Request) {
    deviceID := r.URL.Query().Get("device_id")
    limitStr := r.URL.Query().Get("limit")
    
    limit := 50
    if limitStr != "" {
        if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 1000 {
            limit = l
        }
    }

    query := `
        SELECT id, device_id, route_name,
               ST_AsGeoJSON(geom::geometry) as geom_json,
               start_time, end_time, distance_meters, created_at
        FROM routes
    `

    args := []interface{}{}
    if deviceID != "" {
        query += " WHERE device_id = $1"
        args = append(args, deviceID)
    }

    query += " ORDER BY start_time DESC LIMIT $" + fmt.Sprintf("%d", len(args)+1)
    args = append(args, limit)

    rows, err := api.db.Query(query, args...)
    if err != nil {
        log.Printf("Error querying routes: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    var routes []Route
    for rows.Next() {
        var rt Route
        var geomJSON string
        var routeName sql.NullString
        var distanceMeters sql.NullFloat64

        if err := rows.Scan(&rt.ID, &rt.DeviceID, &routeName, &geomJSON,
                           &rt.StartTime, &rt.EndTime, &distanceMeters, &rt.CreatedAt); err != nil {
            continue
        }

        if routeName.Valid {
            rt.RouteName = routeName.String
        }
        if distanceMeters.Valid {
            rt.DistanceMeters = distanceMeters.Float64
        }

        // Parse GeoJSON
        var geoJSON map[string]interface{}
        if err := json.Unmarshal([]byte(geomJSON), &geoJSON); err == nil {
            if coords, ok := geoJSON["coordinates"].([]interface{}); ok {
                for _, point := range coords {
                    if pt, ok := point.([]interface{}); ok && len(pt) >= 2 {
                        lng, _ := pt[0].(float64)
                        lat, _ := pt[1].(float64)
                        rt.Coordinates = append(rt.Coordinates, []float64{lng, lat})
                    }
                }
            }
        }

        routes = append(routes, rt)
    }

    if routes == nil {
        routes = []Route{}
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(routes)
}

// Create route from device history
func (api *APIServer) createRouteHandler(w http.ResponseWriter, r *http.Request) {
    var input struct {
        DeviceID  string    `json:"device_id"`
        RouteName string    `json:"route_name"`
        StartTime time.Time `json:"start_time"`
        EndTime   time.Time `json:"end_time"`
    }

    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    if input.DeviceID == "" {
        http.Error(w, "device_id is required", http.StatusBadRequest)
        return
    }

    tableName := "locations"
    if api.tablePrefix != "" {
        tableName = api.tablePrefix + "_locations"
    }

    // Query to create route from location points
    query := fmt.Sprintf(`
        WITH route_points AS (
            SELECT location::geometry as geom
            FROM %s
            WHERE device_id = $1
              AND timestamp >= $2
              AND timestamp <= $3
            ORDER BY timestamp ASC
        )
        INSERT INTO routes (device_id, route_name, geom, start_time, end_time, distance_meters)
        SELECT 
            $1,
            $4,
            ST_MakeLine(geom)::geography,
            $2,
            $3,
            ST_Length(ST_MakeLine(geom)::geography)
        FROM route_points
        WHERE (SELECT COUNT(*) FROM route_points) >= 2
        RETURNING id, device_id, route_name, start_time, end_time, distance_meters, created_at
    `, tableName)

    var route Route
    var routeName sql.NullString
    var distanceMeters sql.NullFloat64

    err := api.db.QueryRow(query, input.DeviceID, input.StartTime, input.EndTime, input.RouteName).Scan(
        &route.ID, &route.DeviceID, &routeName, &route.StartTime, &route.EndTime, &distanceMeters, &route.CreatedAt,
    )

    if err != nil {
        if strings.Contains(err.Error(), "violates check constraint") {
            http.Error(w, "Not enough points to create route (minimum 2 required)", http.StatusBadRequest)
        } else {
            log.Printf("Error creating route: %v", err)
            http.Error(w, "Database error", http.StatusInternalServerError)
        }
        return
    }

    if routeName.Valid {
        route.RouteName = routeName.String
    }
    if distanceMeters.Valid {
        route.DistanceMeters = distanceMeters.Float64
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(route)
}

// Add this function near the other route handlers (around line 1100)
func (api *APIServer) deleteRouteHandler(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    routeID := vars["id"]

    result, err := api.db.Exec("DELETE FROM routes WHERE id = $1", routeID)
    if err != nil {
        log.Printf("Error deleting route: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    rowsAffected, _ := result.RowsAffected()
    if rowsAffected == 0 {
        http.Error(w, "Route not found", http.StatusNotFound)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

// Distance calculation between two points
func (api *APIServer) distanceHandler(w http.ResponseWriter, r *http.Request) {
    lat1Str := r.URL.Query().Get("lat1")
    lng1Str := r.URL.Query().Get("lng1")
    lat2Str := r.URL.Query().Get("lat2")
    lng2Str := r.URL.Query().Get("lng2")

    if lat1Str == "" || lng1Str == "" || lat2Str == "" || lng2Str == "" {
        http.Error(w, "All parameters required: lat1, lng1, lat2, lng2", http.StatusBadRequest)
        return
    }

    lat1, err1 := strconv.ParseFloat(lat1Str, 64)
    lng1, err2 := strconv.ParseFloat(lng1Str, 64)
    lat2, err3 := strconv.ParseFloat(lat2Str, 64)
    lng2, err4 := strconv.ParseFloat(lng2Str, 64)

    if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
        http.Error(w, "Invalid coordinates", http.StatusBadRequest)
        return
    }

    var distanceMeters float64
    query := `
        SELECT ST_Distance(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
        )
    `

    err := api.db.QueryRow(query, lng1, lat1, lng2, lat2).Scan(&distanceMeters)
    if err != nil {
        log.Printf("Error calculating distance: %v", err)
        http.Error(w, "Database error", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "point1": map[string]float64{
            "latitude":  lat1,
            "longitude": lng1,
        },
        "point2": map[string]float64{
            "latitude":  lat2,
            "longitude": lng2,
        },
        "distance_meters":     distanceMeters,
        "distance_kilometers": distanceMeters / 1000,
        "distance_miles":      distanceMeters / 1609.34,
    })
}


// Main Application
type App struct {
	config     *Config
	db         *Database
	udpSniffer *UDPSniffer
	apiServer  *APIServer
	wsHub      *WebSocketHub
}

func NewApp() (*App, error) {
	// ✅ Inicializar encriptación primero
	if err := initEncryption(); err != nil {
		return nil, fmt.Errorf("failed to initialize encryption: %w", err)
	}

	config := loadConfig()

	if config.LogFile != "" {
		f, err := os.OpenFile(config.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			log.Printf("Failed to open log file %s: %v", config.LogFile, err)
		} else {
			mw := io.MultiWriter(os.Stdout, f)
			log.SetOutput(mw)
		}
	}

	db, err := NewDatabase(config)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	if err := db.InitializeSchema(config.TablePrefix); err != nil {
		return nil, fmt.Errorf("failed to initialize database schema: %w", err)
	}

	wsHub := NewWebSocketHub()
	udpSniffer := NewUDPSniffer(db, wsHub, config.UDPPort, config.TablePrefix)
	apiServer := NewAPIServer(db, wsHub, config.Port, config.TablePrefix)

	return &App{
		config:     config,
		db:         db,
		udpSniffer: udpSniffer,
		apiServer:  apiServer,
		wsHub:      wsHub,
	}, nil
}

func (app *App) Run() error {
	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())

	// Start WebSocket hub
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.wsHub.Run(ctx)
	}()

	// Start UDP sniffer
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.udpSniffer.Run(ctx)
	}()

	// Start API server
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.apiServer.Run(ctx)
	}()

	// Wait for interrupt signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down application...")
	cancel()
	wg.Wait()

	if err := app.db.Close(); err != nil {
		log.Printf("Error closing database: %v", err)
	}

	log.Println("Application stopped")
	return nil
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	app, err := NewApp()
	if err != nil {
		log.Fatalf("Failed to create application: %v", err)
	}

	if err := app.Run(); err != nil {
		log.Fatalf("Application error: %v", err)
	}
}
