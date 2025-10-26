export class WebSocketManager {
  constructor(locationTracker) {
    this.tracker = locationTracker;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = this.tracker.maxReconnectAttempts;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.tracker.config.wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.tracker.updateConnectionStatus(this.tracker.t('connected'), 'connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.tracker.handleLocationUpdate(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.tracker.updateConnectionStatus(this.tracker.t('disconnected'), 'disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.tracker.updateConnectionStatus(this.tracker.t('connectionError'), 'disconnected');
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.tracker.updateConnectionStatus(this.tracker.t('connectionFailed'), 'disconnected');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      this.tracker.updateConnectionStatus(
        this.tracker.t('reconnecting')
          .replace('{0}', Math.ceil(delay / 1000))
          .replace('{1}', this.reconnectAttempts)
          .replace('{2}', this.maxReconnectAttempts),
        'reconnecting'
      );

      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      this.tracker.updateConnectionStatus(this.tracker.t('connectionFailed'), 'disconnected');
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
