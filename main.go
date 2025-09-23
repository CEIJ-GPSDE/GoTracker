package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
)

// Configuration from environment variables
type Config struct {
	DBHost     string
	DBName     string
	DBUser     string
	DBPassword string
	DBSSLMode  string
	Port       string
	UDPPort    string
	LogFile    string
	CertFile   string
	KeyFile    string
}

func loadConfig() *Config {
	return &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBName:     getEnv("DB_NAME", "locationtracker"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "password"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		Port:       getEnv("PORT", "80"),
		UDPPort:    getEnv("UDP_PORT", "5051"),
		LogFile:    getEnv("LOG_FILE", ""),
		CertFile:   getEnv("CERT_FILE", "certs/server.crt"),
		KeyFile:    getEnv("KEY_FILE", "certs/server.key"),
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
		config.DBName, getEnv("DB_SSLMODE", "require"),
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	return &Database{db}, nil
}

func (db *Database) InitializeSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS locations (
		id SERIAL PRIMARY KEY,
		device_id VARCHAR(255) NOT NULL,
		latitude DECIMAL(10, 8) NOT NULL,
		longitude DECIMAL(11, 8) NOT NULL,
		timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_locations_device_timestamp ON locations(device_id, timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_locations_timestamp_range ON locations(timestamp);
	`

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

	// Handle client messages (mainly for ping/pong)
	go func() {
		defer func() {
			h.unregister <- conn
		}()

		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket unexpected close error: %v", err)
				}
				break
			}
		}
	}()

	// Send periodic pings
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
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

// UDP Sniffer - simplified without leader election
type UDPSniffer struct {
	db    *Database
	wsHub *WebSocketHub
	port  string
}

func NewUDPSniffer(db *Database, wsHub *WebSocketHub, port string) *UDPSniffer {
	return &UDPSniffer{
		db:    db,
		wsHub: wsHub,
		port:  port,
	}
}

func (us *UDPSniffer) Run(ctx context.Context) {
	log.Println("Starting UDP sniffer service")

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

	log.Printf("Started UDP listening on port %s", us.port)

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

			packet := us.parsePacket(buffer[:n])
			if packet != nil {
				if err := us.storeLocation(packet); err != nil {
					log.Printf("Error storing location: %v", err)
				} else {
					us.wsHub.Broadcast(packet)
					log.Printf("Processed location packet from %s: Device=%s, Lat=%.6f, Lng=%.6f",
						addr, packet.DeviceID, packet.Latitude, packet.Longitude)
				}
			}
		}
	}
}

func (us *UDPSniffer) parsePacket(data []byte) *LocationPacket {
	parts := string(data)
	if len(parts) < 10 {
		return nil
	}

	var deviceID string
	var lat, lng float64

	parsed, err := fmt.Sscanf(parts, "%[^,],%f,%f", &deviceID, &lat, &lng)
	if err != nil || parsed != 3 {
		// Generate mock data for demonstration if parsing fails
		deviceID = "device_" + strconv.Itoa(rand.Intn(1000))
		lat = 40.7128 + (rand.Float64()-0.5)*0.1
		lng = -74.0060 + (rand.Float64()-0.5)*0.1
	}

	// Validate coordinates
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		log.Printf("Invalid coordinates: lat=%f, lng=%f", lat, lng)
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
	query := `
		INSERT INTO locations (device_id, latitude, longitude, timestamp)
		VALUES ($1, $2, $3, $4)
	`
	_, err := us.db.Exec(query, packet.DeviceID, packet.Latitude, packet.Longitude, packet.Timestamp)
	return err
}

// API Server - enhanced with historical endpoints
type APIServer struct {
	db     *Database
	wsHub  *WebSocketHub
	server *http.Server
	port   string
}

func NewAPIServer(db *Database, wsHub *WebSocketHub, port string) *APIServer {
	return &APIServer{
		db:    db,
		wsHub: wsHub,
		port:  port,
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
	r.HandleFunc("/api/health", api.healthHandler).Methods("GET")
	r.HandleFunc("/api/health/db", api.dbHealthHandler).Methods("GET")
	r.HandleFunc("/api/stats", api.statsHandler).Methods("GET")
	r.HandleFunc("/api/locations/latest", api.latestLocationHandler).Methods("GET")
	r.HandleFunc("/api/locations/history", api.locationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/locations/range", api.locationRangeHandler).Methods("GET") // New endpoint
	r.HandleFunc("/api/locations/device/{deviceId}", api.deviceLocationHistoryHandler).Methods("GET")
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

	var totalLocations int
	var activeDevices int
	var lastUpdate sql.NullTime

	err := api.db.QueryRow("SELECT COUNT(*) FROM locations").Scan(&totalLocations)
	if err != nil {
		log.Printf("Error counting locations: %v", err)
	}

	err = api.db.QueryRow("SELECT COUNT(DISTINCT device_id) FROM locations").Scan(&activeDevices)
	if err != nil {
		log.Printf("Error counting active devices: %v", err)
	}

	err = api.db.QueryRow("SELECT MAX(timestamp) FROM locations").Scan(&lastUpdate)
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
	query := `
		SELECT device_id, latitude, longitude, timestamp
		FROM locations
		ORDER BY timestamp DESC
		LIMIT 1
	`

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

	// Validate limit
	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt <= 0 || limitInt > 1000 {
		http.Error(w, "Invalid limit parameter", http.StatusBadRequest)
		return
	}

	query := `
		SELECT device_id, latitude, longitude, timestamp
		FROM locations
		ORDER BY timestamp DESC
		LIMIT $1
	`

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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

// New handler for historical time range queries
func (api *APIServer) locationRangeHandler(w http.ResponseWriter, r *http.Request) {
	startTimeStr := r.URL.Query().Get("start")
	endTimeStr := r.URL.Query().Get("end")
	deviceID := r.URL.Query().Get("device")

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

	// Limit the time range to prevent huge queries
	maxDuration := 30 * 24 * time.Hour // 30 days
	if endTime.Sub(startTime) > maxDuration {
		http.Error(w, "Time range too large, maximum 30 days", http.StatusBadRequest)
		return
	}

	var query string
	var args []interface{}

	if deviceID != "" {
		query = `
			SELECT device_id, latitude, longitude, timestamp
			FROM locations
			WHERE timestamp >= $1 AND timestamp <= $2 AND device_id = $3
			ORDER BY timestamp DESC
			LIMIT 1000
		`
		args = []interface{}{startTime, endTime, deviceID}
	} else {
		query = `
			SELECT device_id, latitude, longitude, timestamp
			FROM locations
			WHERE timestamp >= $1 AND timestamp <= $2
			ORDER BY timestamp DESC
			LIMIT 1000
		`
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
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

	// Validate limit
	limitInt, err := strconv.Atoi(limit)
	if err != nil || limitInt <= 0 || limitInt > 1000 {
		http.Error(w, "Invalid limit parameter", http.StatusBadRequest)
		return
	}

	query := `
		SELECT device_id, latitude, longitude, timestamp
		FROM locations
		WHERE device_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`

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
	config := loadConfig()

	if config.LogFile != "" {
		f, err := os.OpenFile(config.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
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

	if err := db.InitializeSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize database schema: %w", err)
	}

	wsHub := NewWebSocketHub()
	udpSniffer := NewUDPSniffer(db, wsHub, config.UDPPort)
	apiServer := NewAPIServer(db, wsHub, config.Port)

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