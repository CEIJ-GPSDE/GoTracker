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
)

// ========== CONFIGURACIÓN DE ENCRIPTACIÓN ==========
// La misma clave AES-128 que en el ESP32 (16 bytes en hexadecimal)
const AES_KEY_HEX = "2b7e151628aed2a6abf7158809cf4f3c"

var aesKey []byte

func initEncryption() error {
	var err error
	aesKey, err = hex.DecodeString(AES_KEY_HEX)
	if err != nil {
		return fmt.Errorf("error decodificando clave AES: %w", err)
	}
	if len(aesKey) != 16 {
		return fmt.Errorf("la clave AES debe ser de 16 bytes, obtenido: %d", len(aesKey))
	}
	log.Printf("✓ Clave AES-128-GCM inicializada correctamente")
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

	schema := fmt.Sprintf(`
    CREATE TABLE IF NOT EXISTS %s (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_%s_timestamp ON %s(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_%s_device_timestamp ON %s(device_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_%s_timestamp_range ON %s(timestamp);
    `, tableName, tableName, tableName, tableName, tableName, tableName, tableName)

	_, err := db.Exec(schema)
	return err
}

// Location data structure
type LocationPacket struct {
	DeviceID  string    `json:"device_id"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Timestamp time.Time `json:"timestamp"`
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

	query := fmt.Sprintf(`
        INSERT INTO %s (device_id, latitude, longitude, timestamp)
        VALUES ($1, $2, $3, $4)
    `, tableName)
	_, err := us.db.Exec(query, packet.DeviceID, packet.Latitude, packet.Longitude, packet.Timestamp)
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
	r := mux.NewRouter()

	// API routes
	r.HandleFunc("/api/devices", api.activeDevicesHandler).Methods("GET")
	r.HandleFunc("/api/health", api.healthHandler).Methods("GET")
	r.HandleFunc("/api/health/db", api.dbHealthHandler).Methods("GET")
	r.HandleFunc("/api/locations/latest", api.latestLocationHandler).Methods("GET")
	r.HandleFunc("/api/locations/history", api.locationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/locations/range", api.locationRangeHandler).Methods("GET")
	r.HandleFunc("/api/locations/nearby", api.locationNearbyHandler).Methods("GET")
	r.HandleFunc("/api/locations/device/{deviceId}", api.deviceLocationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/stats", api.statsHandler).Methods("GET")
	r.HandleFunc("/ws", api.wsHub.HandleWebSocket)

	// Static files
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))
	r.Use(corsMiddleware)

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
		SELECT device_id, latitude, longitude, timestamp
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
		SELECT device_id, latitude, longitude, timestamp
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
		// Build query with multiple device IDs
		placeholders := make([]string, len(deviceIDs))
		args = append(args, startTime, endTime)
		for i, deviceID := range deviceIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+3)
			args = append(args, deviceID)
		}

		query = fmt.Sprintf(`
			SELECT device_id, latitude, longitude, timestamp
			FROM %s
			WHERE timestamp >= $1 AND timestamp <= $2 AND device_id IN (%s)
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName, strings.Join(placeholders, ","))
	} else {
		query = fmt.Sprintf(`
			SELECT device_id, latitude, longitude, timestamp
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

	var query string
	var args []interface{}

	if len(deviceIDs) > 0 {
		// Build query with device filter
		placeholders := make([]string, len(deviceIDs))
		args = append(args, lat, lng, radius)
		for i, deviceID := range deviceIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+4)
			args = append(args, deviceID)
		}

		query = fmt.Sprintf(`
			SELECT device_id, latitude, longitude, timestamp
			FROM %s
			WHERE (6371 * acos(
			    cos(radians($1)) * cos(radians(latitude)) *
			    cos(radians(longitude) - radians($2)) +
			    sin(radians($1)) * sin(radians(latitude))
			)) <= $3
			AND device_id IN (%s)
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName, strings.Join(placeholders, ","))
	} else {
		// No device filter
		query = fmt.Sprintf(`
			SELECT device_id, latitude, longitude, timestamp
			FROM %s
			WHERE (6371 * acos(
			    cos(radians($1)) * cos(radians(latitude)) *
			    cos(radians(longitude) - radians($2)) +
			    sin(radians($1)) * sin(radians(latitude))
			)) <= $3
			ORDER BY timestamp DESC
			LIMIT 1000
		`, tableName)
		args = []interface{}{lat, lng, radius}
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
		SELECT device_id, latitude, longitude, timestamp
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
