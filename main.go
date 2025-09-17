package main

import (
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
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
	"golang.org/x/crypto/acme/autocert"
)
type Config struct {
	DBHost     string
	DBName     string
	DBUser     string
	DBPassword string
	DBSSLMode  string
	Port       string
	HTTPSPort  string
	UDPPort    string
	LogFile    string
	CertFile   string
	KeyFile    string
	AWSRegion  string
	AWSMapName string
	AWSApiKey  string
	Domain     string
	AutoTLS    bool
}

func loadConfig() *Config {

	config := &Config{}

	// Load from environment variables first
	config.DBHost = getEnv("DB_HOST", "localhost")
	config.DBName = getEnv("DB_NAME", "locationtracker")
	config.DBUser = getEnv("DB_USER", "postgres")
	config.DBPassword = getEnv("DB_PASSWORD", "password")
	config.DBSSLMode = getEnv("DB_SSLMODE", "disable")
	config.Port = getEnv("PORT", "8080")
	config.HTTPSPort = getEnv("HTTPS_PORT", "8443")
	config.UDPPort = getEnv("UDP_PORT", "5051")
	config.LogFile = getEnv("LOG_FILE", "")
	config.CertFile = getEnv("CERT_FILE", "certs/server.crt")
	config.KeyFile = getEnv("KEY_FILE", "certs/server.key")
	config.AWSRegion = getEnv("AWS_REGION", "us-east-1")
	config.AWSMapName = getEnv("AWS_MAP_NAME", "MyMap")
	config.AWSApiKey = getEnv("AWS_API_KEY", "")
	config.Domain = getEnv("DOMAIN", "")
	config.AutoTLS = getEnv("AUTO_TLS", "false") == "true"

	// Override with command line flags if provided
	flag.StringVar(&config.DBHost, "db-host", config.DBHost, "Database host")
	flag.StringVar(&config.DBName, "db-name", config.DBName, "Database name")
	flag.StringVar(&config.DBUser, "db-user", config.DBUser, "Database user")
	flag.StringVar(&config.DBPassword, "db-password", config.DBPassword, "Database password")
	flag.StringVar(&config.DBSSLMode, "db-sslmode", config.DBSSLMode, "Database SSL mode")
	flag.StringVar(&config.Port, "port", config.Port, "HTTP server port")
	flag.StringVar(&config.HTTPSPort, "https-port", config.HTTPSPort, "HTTPS server port")
	flag.StringVar(&config.UDPPort, "udp-port", config.UDPPort, "UDP listener port")
	flag.StringVar(&config.LogFile, "log-file", config.LogFile, "Log file path (empty for stdout only)")
	flag.StringVar(&config.CertFile, "cert-file", config.CertFile, "TLS certificate file")
	flag.StringVar(&config.KeyFile, "key-file", config.KeyFile, "TLS private key file")
	flag.StringVar(&config.AWSRegion, "aws-region", config.AWSRegion, "AWS Region")
	flag.StringVar(&config.AWSMapName, "aws-map-name", config.AWSMapName, "Amazon Location map name")
	flag.StringVar(&config.AWSApiKey, "aws-api-key", config.AWSApiKey, "Amazon Location Service API Key")
	flag.StringVar(&config.Domain, "domain", config.Domain, "Domain name for auto TLS")
	flag.BoolVar(&config.AutoTLS, "auto-tls", config.AutoTLS, "Enable automatic TLS with Let's Encrypt")

	// Add version flag
	version := flag.Bool("version", false, "Show version information")
	flag.Parse()

	if *version {
		fmt.Println("Location Tracker v1.0.0")
		fmt.Printf("Built with Go %s\n", "1.21+")
		os.Exit(0)
	}

	return config
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

// UDP Sniffer (keeping same implementation)
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

func (us *UDPSniffer) handlePackets(ctx context.Context) {
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
	// Simple parsing - expecting format: "deviceID,latitude,longitude"
	str := string(data)
	parts := strings.Split(str, ",")
	if len(parts) != 3 {
		log.Printf("Invalid packet format: %s", str)
		return nil
	}

	deviceID := strings.TrimSpace(parts[0])
	latStr := strings.TrimSpace(parts[1])
	lonStr := strings.TrimSpace(parts[2])

	latitude, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		log.Printf("Invalid latitude: %s (%v)", latStr, err)
		return nil
	}

	longitude, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		log.Printf("Invalid longitude: %s (%v)", lonStr, err)
		return nil
	}

	return &LocationPacket{
		DeviceID:  deviceID,
		Latitude:  latitude,
		Longitude: longitude,
		Timestamp: time.Now().UTC(),
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

// Enhanced API Server with dual HTTP/HTTPS support
type APIServer struct {
	db          *Database
	wsHub       *WebSocketHub
	httpServer  *http.Server
	httpsServer *http.Server
	leaderEl    *LeaderElection
	config      *Config
}

func NewAPIServer(db *Database, wsHub *WebSocketHub, leaderEl *LeaderElection, config *Config) *APIServer {
	return &APIServer{
		db:       db,
		wsHub:    wsHub,
		leaderEl: leaderEl,
		config:   config,
		httpServer: &http.Server{
			Addr:         ":" + config.Port,
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 15 * time.Second,
		},
		httpsServer: &http.Server{
			Addr:         ":" + config.HTTPSPort,
			ReadTimeout:  15 * time.Second,
			WriteTimeout: 15 * time.Second,
		},
	}
}

func (api *APIServer) createRouter() *mux.Router {
	r := mux.NewRouter()

	// API routes
	r.HandleFunc("/api/health", api.healthHandler).Methods("GET")
	r.HandleFunc("/api/health/udp", api.udpHealthHandler).Methods("GET")
	r.HandleFunc("/api/health/db", api.dbHealthHandler).Methods("GET")
	r.HandleFunc("/api/stats", api.statsHandler).Methods("GET")
	r.HandleFunc("/api/locations/latest", api.latestLocationHandler).Methods("GET")
	r.HandleFunc("/api/locations/history", api.locationHistoryHandler).Methods("GET")
	r.HandleFunc("/api/config", api.configHandler).Methods("GET")
	r.HandleFunc("/ws", api.wsHub.HandleWebSocket)

	// Static files (serve built frontend if present)
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))

	// CORS middleware
	r.Use(corsMiddleware)

	return r
}

func (api *APIServer) Run(ctx context.Context) {
	router := api.createRouter()
	api.httpServer.Handler = router
	api.httpsServer.Handler = router

	var wg sync.WaitGroup

	// Start HTTP server
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Printf("HTTP server starting on port %s", api.config.Port)
		if err := api.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	// Start HTTPS server based on configuration
	if api.shouldStartHTTPS() {
		wg.Add(1)
		go func() {
			defer wg.Done()
			api.startHTTPS()
		}()
	}

	<-ctx.Done()

	// Shutdown servers
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := api.httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	if api.httpsServer != nil {
		if err := api.httpsServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("HTTPS server shutdown error: %v", err)
		}
	}

	wg.Wait()
}

func (api *APIServer) shouldStartHTTPS() bool {
	// Check if auto TLS is enabled and domain is configured
	if api.config.AutoTLS && api.config.Domain != "" {
		return true
	}

	// Check if certificate files exist
	if _, err := os.Stat(api.config.CertFile); err == nil {
		if _, errK := os.Stat(api.config.KeyFile); errK == nil {
			return true
		}
	}

	return false
}

func (api *APIServer) startHTTPS() {
	if api.config.AutoTLS && api.config.Domain != "" {
		log.Printf("Starting HTTPS server with Let's Encrypt on port %s for domain %s", api.config.HTTPSPort, api.config.Domain)

		// Create autocert manager
		certManager := autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(api.config.Domain),
			Cache:      autocert.DirCache("certs"),
		}

		// Configure TLS
		api.httpsServer.TLSConfig = &tls.Config{
			GetCertificate: certManager.GetCertificate,
			MinVersion:     tls.VersionTLS12,
		}

		// Start HTTPS server with autocert
		if err := api.httpsServer.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTPS server with autocert error: %v", err)
		}
	} else {
		log.Printf("Starting HTTPS server with custom certificates on port %s", api.config.HTTPSPort)

		// Configure TLS with custom certificates
		api.httpsServer.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}

		if err := api.httpsServer.ListenAndServeTLS(api.config.CertFile, api.config.KeyFile); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTPS server error: %v", err)
		}
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
		"version":     "1.0.0",
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

func (api *APIServer) configHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"region":  api.config.AWSRegion,
		"mapName": api.config.AWSMapName,
		"apiKey":  api.config.AWSApiKey,
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
	apiServer := NewAPIServer(db, wsHub, leaderElection, config)

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

	// Start API server
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.apiServer.Run(ctx)
	}()

	// Wait for interrupt signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop,
		os.Interrupt,    // Ctrl+C
		syscall.SIGTERM, // kill
		syscall.SIGQUIT, // quit
		syscall.SIGTSTP, // Ctrl+Z (suspend)
	)
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
