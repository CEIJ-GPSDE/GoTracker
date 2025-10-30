export class WebSocketManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = this.tracker.maxReconnectAttempts;
    this.reconnectTimeout = null;
    this.isIntentionalClose = false;
    this.pingInterval = null;
    this.lastPong = Date.now();
  }

  connect() {
    if (this.isIntentionalClose) {
      return;
    }

    try {
      // Clear any existing connection
      this.cleanup();

      console.log('Connecting to WebSocket:', this.tracker.config.wsUrl);
      this.ws = new WebSocket(this.tracker.config.wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected successfully');
        this.reconnectAttempts = 0;
        this.lastPong = Date.now();
        this.tracker.updateConnectionStatus(this.tracker.t('connected'), 'connected');
        
        // Start ping-pong mechanism
        this.startPingPong();
      };

      this.ws.onmessage = (event) => {
        try {
          // Handle pong messages
          if (event.data === 'pong') {
            this.lastPong = Date.now();
            return;
          }

          const data = JSON.parse(event.data);
          this.tracker.handleLocationUpdate(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        
        this.cleanupPingPong();
        
        if (!this.isIntentionalClose) {
          this.tracker.updateConnectionStatus(this.tracker.t('disconnected'), 'disconnected');
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!this.isIntentionalClose) {
          this.tracker.updateConnectionStatus(this.tracker.t('connectionError'), 'disconnected');
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      if (!this.isIntentionalClose) {
        this.tracker.updateConnectionStatus(this.tracker.t('connectionFailed'), 'disconnected');
        this.scheduleReconnect();
      }
    }
  }

  startPingPong() {
    // Clear any existing interval
    this.cleanupPingPong();

    // Send ping every 25 seconds (less than typical timeout periods)
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        // Check if we've received a pong recently
        const timeSinceLastPong = Date.now() - this.lastPong;
        if (timeSinceLastPong > 30000) { // 30 seconds without pong
          console.warn('No pong received, reconnecting...');
          this.ws.close(); // This will trigger reconnect
          return;
        }

        try {
          this.ws.send('ping');
        } catch (error) {
          console.error('Error sending ping:', error);
          this.ws.close();
        }
      }
    }, 25000); // 25 seconds
  }

  cleanupPingPong() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.isIntentionalClose || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.tracker.updateConnectionStatus(this.tracker.t('connectionFailed'), 'disconnected');
      }
      return;
    }

    // Clear any existing timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.tracker.updateConnectionStatus(
      this.tracker.t('reconnecting')
        .replace('{0}', Math.ceil(delay / 1000))
        .replace('{1}', this.reconnectAttempts)
        .replace('{2}', this.maxReconnectAttempts),
      'reconnecting'
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this.isIntentionalClose = true;
    this.cleanup();
  }

  cleanup() {
    this.cleanupPingPong();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      // Remove event listeners to prevent memory leaks
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Intentional disconnect');
      }
      this.ws = null;
    }
  }

  // Method to reset intentional close flag for reconnections
  resetIntentionalClose() {
    this.isIntentionalClose = false;
  }
}
