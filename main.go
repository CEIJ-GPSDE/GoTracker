package main

import (
	"context"
	"crypto/tls"
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
        "strings"


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

	CREATE TABLE IF NOT EXISTS leader_election (
		service VARCHAR(255) PRIMARY KEY,
		instance_id VARCHAR(255) NOT NULL,
		last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL
	);
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

// Leader Election
type LeaderElection struct {
	db         *Database
	instanceID string
	isLeader   bool
	mutex      sync.RWMutex
}

func NewLeaderElection(db *Database) *LeaderElection {
	return &LeaderElection{
		db:         db,
		instanceID: generateInstanceID(),
		isLeader:   false,
	}
}

func generateInstanceID() string {
	hostname, _ := os.Hostname()
	return fmt.Sprintf("%s-%d-%d", hostname, os.Getpid(), rand.Intn(10000))
}

func (le *LeaderElection) Run(ctx context.Context) {
	log.Printf("Starting leader election with instance ID: %s", le.instanceID)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// Try to acquire leadership immediately
	le.tryAcquireLeadership()

	for {
		select {
		case <-ctx.Done():
			le.releaseLeadership()
			return
		case <-ticker.C:
			le.tryAcquireLeadership()
		}
	}
}

func (le *LeaderElection) IsLeader() bool {
	le.mutex.RLock()
	defer le.mutex.RUnlock()
	return le.isLeader
}

func (le *LeaderElection) tryAcquireLeadership() {
	query := `
		INSERT INTO leader_election (service, instance_id, last_heartbeat)
		VALUES ('udp_sniffer', $1, NOW())
		ON CONFLICT (service) DO UPDATE SET
			instance_id = CASE 
				WHEN leader_election.last_heartbeat < NOW() - INTERVAL '15 seconds'
				THEN $1
				ELSE leader_election.instance_id
			END,
			last_heartbeat = CASE
				WHEN leader_election.instance_id = $1 OR 
					 leader_election.last_heartbeat < NOW() - INTERVAL '15 seconds'
				THEN NOW()
				ELSE leader_election.last_heartbeat
			END
		RETURNING instance_id = $1 as is_leader
	`

	var isLeader bool
	err := le.db.QueryRow(query, le.instanceID).Scan(&isLeader)
	if err != nil {
		log.Printf("Leader election error: %v", err)
		return
	}

	le.mutex.Lock()
	wasLeader := le.isLeader
	le.isLeader = isLeader
	le.mutex.Unlock()

	if isLeader && !wasLeader {
		log.Printf("Instance %s became UDP sniffer leader", le.instanceID)
	} else if !isLeader && wasLeader {
		log.Printf("Instance %s lost UDP sniffer leadership", le.instanceID)
	}
}

func (le *LeaderElection) releaseLeadership() {
	query := `DELETE FROM leader_election WHERE service = 'udp_sniffer' AND instance_id = $1`
	_, err := le.db.Exec(query, le.instanceID)
	if err != nil {
		log.Printf("Error releasing leadership: %v", err)
	} else {
		log.Printf("Instance %s released leadership", le.instanceID)
	}
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

// ClientCount returns number of connected websocket clients
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

		// Set up ping/pong handlers
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
		for range ticker.C {
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}()

	// block main or wait for signals...
}

func (h *WebSocketHub) Broadcast(data interface{}) {
	select {
	case h.broadcast <- data:
	default:
		log.Println("WebSocket broadcast channel full, dropping message")
	}
}

// UDP Sniffer
type UDPSniffer struct {
	db    *Database
	wsHub *WebSocketHub
	conn  *net.UDPConn
	port  string
}

func NewUDPSniffer(db *Database, wsHub *WebSocketHub, port string) *UDPSniffer {
	return &UDPSniffer{
		db:    db,
		wsHub: wsHub,
		port:  port,
	}
}

func (us *UDPSniffer) Run(ctx context.Context, le *LeaderElection) {
	log.Println("Starting UDP sniffer service")
	for {
		select {
		case <-ctx.Done():
			if us.conn != nil {
				us.conn.Close()
			}
			return
		default:
			if le.IsLeader() {
				if us.conn == nil {
					us.startListening()
				}
				us.handlePackets(ctx)
			} else {
				if us.conn != nil {
					us.conn.Close()
					us.conn = nil
					log.Println("Stopped UDP listening (no longer leader)")
				}
				time.Sleep(2 * time.Second)
			}
		}
	}
}

func (us *UDPSniffer) startListening() {
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

	us.conn = conn
	log.Printf("Started UDP listening on port %s", us.port)
}

func (us *UDPSniffer) handlePackets(_ context.Context) {
	if us.conn == nil {
		return
	}

	us.conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	buffer := make([]byte, 1024)
	n, addr, err := us.conn.ReadFromUDP(buffer)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return // Timeout is expected for periodic leader checks
		}
		log.Printf("UDP read error: %v", err)
		return
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

func (us *UDPSniffer) parsePacket(data []byte) *LocationPacket {
    // Log raw packet for debugging
    log.Printf("Raw UDP packet: %s", string(data))

    // Convert to string and trim whitespace
    parts := strings.TrimSpace(string(data))
    if len(parts) < 10 { // Basic validation
        log.Printf("Packet too short: %s", parts)
        return nil
    }

    // Split by comma
    fields := strings.Split(parts, ",")
    if len(fields) != 3 {
        log.Printf("Invalid packet format, expected 'deviceID,latitude,longitude', got %d fields: %v", len(fields), fields)
        return nil
    }

    // Parse fields
    deviceID := strings.TrimSpace(fields[0])
    latStr := strings.TrimSpace(fields[1])
    lngStr := strings.TrimSpace(fields[2])

    // Parse latitude and longitude
    lat, err := strconv.ParseFloat(latStr, 64)
    if err != nil {
        log.Printf("Failed to parse latitude '%s': %v", latStr, err)
        return nil
    }
    lng, err := strconv.ParseFloat(lngStr, 64)
    if err != nil {
        log.Printf("Failed to parse longitude '%s': %v", lngStr, err)
        return nil
    }

    // Validate coordinates
    if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
        log.Printf("Invalid coordinates: lat=%f, lng=%f", lat, lng)
        return nil
    }

    // Validate deviceID
    if deviceID == "" {
        log.Printf("Empty deviceID in packet: %s", parts)
        return nil
    }

    log.Printf("Parsed packet: DeviceID=%s, Lat=%f, Lng=%f", deviceID, lat, lng)

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

// API Server
type APIServer struct {
	db       *Database
	wsHub    *WebSocketHub
	server   *http.Server
	leaderEl *LeaderElection
	port     string
}

func NewAPIServer(db *Database, wsHub *WebSocketHub, leaderEl *LeaderElection, port string) *APIServer {
	return &APIServer{
		db:       db,
		wsHub:    wsHub,
		leaderEl: leaderEl,
		port:     port,
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
	r.HandleFunc("/api/health/udp", api.udpHealthHandler).Methods("GET")
	r.HandleFunc("/api/health/db", api.dbHealthHandler).Methods("GET")
	r.HandleFunc("/api/stats", api.statsHandler).Methods("GET")
	r.HandleFunc("/api/locations/latest", api.latestLocationHandler).Methods("GET")
	r.HandleFunc("/api/locations/history", api.locationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/locations/device/{deviceId}", api.deviceLocationHistoryHandler).Methods("GET")
	r.HandleFunc("/ws", api.wsHub.HandleWebSocket)

	// Static files (serve built frontend if present)
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))

	// CORS middleware
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

func (api *APIServer) RunHTTPS(ctx context.Context, certFile, keyFile string) {
	r := mux.NewRouter()

	// API routes
	r.HandleFunc("/api/health", api.healthHandler).Methods("GET")
	r.HandleFunc("/api/health/udp", api.udpHealthHandler).Methods("GET")
	r.HandleFunc("/api/health/db", api.dbHealthHandler).Methods("GET")
	r.HandleFunc("/api/stats", api.statsHandler).Methods("GET")
	r.HandleFunc("/api/locations/latest", api.latestLocationHandler).Methods("GET")
	r.HandleFunc("/api/locations/history", api.locationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/locations/device/{deviceId}", api.deviceLocationHistoryHandler).Methods("GET")
	r.HandleFunc("/ws", api.wsHub.HandleWebSocket)

	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))

	r.Use(corsMiddleware)

	api.server.Handler = r

	// TLS config
	api.server.TLSConfig = &tls.Config{
		MinVersion: tls.VersionTLS12,
	}

	go func() {
		log.Printf("HTTPS server starting on port %s", api.port)
		if err := api.server.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTPS server error: %v", err)
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := api.server.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTPS server shutdown error: %v", err)
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
		"status":      "healthy",
		"timestamp":   time.Now(),
		"instance_id": api.leaderEl.instanceID,
	})
}

func (api *APIServer) udpHealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"is_leader":   api.leaderEl.IsLeader(),
		"instance_id": api.leaderEl.instanceID,
		"timestamp":   time.Now(),
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

// statsHandler returns live stats used by the frontend
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

	query := fmt.Sprintf(`
		SELECT device_id, latitude, longitude, timestamp
		FROM locations
		ORDER BY timestamp DESC
		LIMIT %s
	`, limit)

	rows, err := api.db.Query(query)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var locations []LocationPacket
	for rows.Next() {
		var location LocationPacket
		if err := rows.Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp); err != nil {
			continue
		}
		locations = append(locations, location)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func (api *APIServer) deviceLocationHistoryHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	deviceId := vars["deviceId"]

	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "50"
	}

	query := fmt.Sprintf(`
		SELECT device_id, latitude, longitude, timestamp
		FROM locations
		WHERE device_id = $1
		ORDER BY timestamp DESC
		LIMIT %s
	`, limit)

	rows, err := api.db.Query(query, deviceId)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var locations []LocationPacket
	for rows.Next() {
		var location LocationPacket
		if err := rows.Scan(&location.DeviceID, &location.Latitude, &location.Longitude, &location.Timestamp); err != nil {
			continue
		}
		locations = append(locations, location)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

// Main Application
type App struct {
	config         *Config
	db             *Database
	leaderElection *LeaderElection
	udpSniffer     *UDPSniffer
	apiServer      *APIServer
	wsHub          *WebSocketHub
}

func NewApp() (*App, error) {
	config := loadConfig()

	// Setup logging to file if requested
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
	leaderElection := NewLeaderElection(db)
	udpSniffer := NewUDPSniffer(db, wsHub, config.UDPPort)
	apiServer := NewAPIServer(db, wsHub, leaderElection, config.Port)

	return &App{
		config:         config,
		db:             db,
		leaderElection: leaderElection,
		udpSniffer:     udpSniffer,
		apiServer:      apiServer,
		wsHub:          wsHub,
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

	// Start leader election
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.leaderElection.Run(ctx)
	}()

	// Start UDP sniffer
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.udpSniffer.Run(ctx, app.leaderElection)
	}()

	// Start API server (choose HTTPS if certs exist)
	wg.Add(1)
	go func() {
		defer wg.Done()
		// if cert files exist, start HTTPS server
		if _, err := os.Stat(app.config.CertFile); err == nil {
			if _, errK := os.Stat(app.config.KeyFile); errK == nil {
				log.Println("Certificates found, starting HTTPS server")
				app.apiServer.RunHTTPS(ctx, app.config.CertFile, app.config.KeyFile)
				return
			}
		}
		log.Println("No certificates found, starting HTTP server")
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
