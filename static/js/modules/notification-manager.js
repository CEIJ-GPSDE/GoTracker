export class NotificationManager {
  constructor(tracker) {
    this.tracker = tracker;
    this.unreadCount = 0;

    // ✅ Auto-refresh every 10 seconds
    setInterval(() => {
      this.loadNotifications();
    }, 10000);
  }

  async loadNotifications() {
    try {
      const response = await fetch(`${this.tracker.config.apiBaseUrl}/api/notifications?limit=50`);
      if (response.ok) {
        const notifications = await response.json();
        this.renderNotifications(notifications);
        this.updateBadge(notifications.filter(n => !n.read).length);
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  }

  renderNotifications(notifications) {
    const container = document.getElementById('notification-list');
    if (!container) return;

    if (notifications.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#9ca3af">No alerts found</div>';
      return;
    }

    container.innerHTML = notifications.map(n => {
      const hasLocation = n.latitude && n.longitude;
      const clickHandler = hasLocation
        ? `onclick="window.locationTracker.mapManager.centerMapOnLocation({latitude: ${n.latitude}, longitude: ${n.longitude}, device_id: '${n.device_id}'})"`
        : '';

      return `
        <div class="notification-item ${n.read ? '' : 'unread'} ${n.type === 'alert' ?  'alert' : ''}"
            ${clickHandler}
            style="${hasLocation ? 'cursor: pointer;' : ''}">
          <div class="notification-header">
            <span style="font-weight: 600;">${n.device_id}</span>
            <span style="font-size: 11px; color: #9ca3af;">${new Date(n.timestamp).toLocaleString()}</span>
          </div>
          <div class="notification-message">${n.message}</div>
          ${hasLocation ?  '<div style="font-size: 10px; color: #3b82f6; margin-top: 4px;">📍 Click to view location</div>' : ''}
        </div>
      `;
    }).join('');
  }

  updateBadge(count) {
    const badge = document.getElementById('alert-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  async markAllRead() {
    await fetch(`${this.tracker.config.apiBaseUrl}/api/notifications/all/read`, { method: 'PUT' });
    this.loadNotifications();
  }
}
