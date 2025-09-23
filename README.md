# Real-time Location Tracker

A robust, scalable real-time location tracking system built with Go, featuring live GPS coordinate visualization, multi-device tracking, and dual-branch deployment capabilities for production and feature testing.

## 🌟 Features

### Core Functionality
- **Real-time GPS Tracking**: Live location updates via UDP protocol
- **Multi-device Support**: Track unlimited devices simultaneously with color-coded markers
- **Interactive Map**: MapLibre-based mapping with route visualization and click-to-center
- **WebSocket Updates**: Instant location updates without page refresh
- **Historical Data**: View location history with configurable limits
- **Leader Election**: Distributed UDP processing with automatic failover
- **Health Monitoring**: Comprehensive API endpoints for system health checks

### Technical Capabilities
- **High Availability**: Leader election ensures only one instance processes UDP data
- **Database Integration**: PostgreSQL with automatic schema initialization
- **SSL/TLS Support**: Full HTTPS support with automatic redirects
- **Docker Containerization**: Complete containerized deployment
- **Nginx Integration**: Reverse proxy with unified configuration management
- **Responsive Design**: Mobile-friendly interface with touch support

### Deployment Features
- **Dual-branch Deployment**: Run production (main) and feature branches simultaneously
- **Automated CI/CD**: GitHub Actions workflows for deployment and cleanup
- **Multi-instance Support**: Deploy across multiple EC2 instances
- **Zero-downtime Updates**: Rolling deployments with health checks
- **Feature Branch Testing**: Test features at `/test/<branch-name>/` paths

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   GPS Devices   │──▶│  Nginx Proxy    │
│   (UDP:5051/52) │    │                 │
└─────────────────┘    └─────────────────┘
                              │
                ┌─────────────┴──────────┐
                │                        │
         ┌──────▼──────┐          ┌──────▼──────┐
         │  Main App   │          │ Feature App │
         │  (Port 8080)│          │ (Port 8081) │
         └──────┬──────┘          └──────┬──────┘
                │                        │
                └────────────┬───────────┘
                             │
                      ┌─────▼─────┐
                      │PostgreSQL │
                      │ Database  │
                      └───────────┘
```

## 📋 Prerequisites

### AWS EC2 Instance Requirements
- **Instance Type**: t2.micro or larger (1 vCPU, 2GB RAM minimum)
- **Operating System**: Amazon Linux 2 or Ubuntu 20.04+
- **Storage**: 8GB+ EBS volume
- **Security Groups**: 
  - Port 22 (SSH)
  - Port 80 (HTTP)
  - Port 443 (HTTPS)
  - Ports 5051-5052 (UDP for GPS data)
  - Port 8080-8081 (Application containers)

### Required Software
- Docker Engine 20.10+
- Docker Compose 1.29+
- Nginx 1.18+
- PostgreSQL Client
- Git

### Domain and SSL
- **Domain Name**: Registered domain with DNS pointing to your EC2 instances
- **SSL Certificate**: Valid SSL certificate and private key files

## 🚀 Initial Instance Setup

### 1. Server Preparation

Connect to your EC2 instance and install required software:

```bash
# Update system
sudo yum update -y  # Amazon Linux 2
# OR
sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo yum install nginx -y  # Amazon Linux 2
# OR
sudo apt install nginx -y  # Ubuntu

# Install PostgreSQL Client
sudo yum install postgresql -y  # Amazon Linux 2
# OR
sudo apt install postgresql-client -y  # Ubuntu

# Start services
sudo systemctl enable docker nginx
sudo systemctl start docker nginx

# Logout and login again to apply docker group membership
exit
```

### 2. Database Setup

Set up your PostgreSQL database (can be RDS or self-hosted):

```sql
-- Create database
CREATE DATABASE locationtracker;

-- Create user with proper permissions
CREATE USER your_db_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE locationtracker TO your_db_user;

-- Connect to the database and grant schema permissions
\c locationtracker;
GRANT ALL ON SCHEMA public TO your_db_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;
```

### 3. SSL Certificate Setup

Create directories and install your SSL certificates:

```bash
# Create certificate directories
sudo mkdir -p /etc/ssl/certs /etc/ssl/private
sudo mkdir -p /home/ec2-user/certs

# Install your SSL certificate (replace with your actual certificate)
sudo nano /etc/ssl/certs/location-tracker.crt
sudo nano /etc/ssl/private/location-tracker.key

# Set proper permissions
sudo chmod 644 /etc/ssl/certs/location-tracker.crt
sudo chmod 600 /etc/ssl/private/location-tracker.key
sudo chown root:root /etc/ssl/private/location-tracker.key

# Copy to user directory for container access
cp /etc/ssl/certs/location-tracker.crt /home/ec2-user/certs/server.crt
cp /etc/ssl/private/location-tracker.key /home/ec2-user/certs/server.key
chmod 600 /home/ec2-user/certs/server.key
```

### 4. Firewall Configuration

```bash
# For Amazon Linux 2 / RHEL
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=5051-5052/udp
sudo firewall-cmd --reload

# For Ubuntu (UFW)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5051:5052/udp
sudo ufw --force enable
```

## ⚙️ GitHub Actions Setup

### Required Repository Secrets

Configure these secrets in your GitHub repository settings:

#### For each EC2 instance (replace `X` with 1, 2, 3, 4):

**Connection Secrets:**
- `EC2_X_HOST`: Your EC2 instance IP address or hostname
- `EC2_X_USER`: SSH username (usually `ec2-user` for Amazon Linux)
- `EC2_X_SSH_KEY`: Private SSH key content (entire key file)
- `EC2_X_DOMAIN`: Your domain name (e.g., `example.com`)

**Database Secrets:**
- `EC2_X_DB_HOST`: Database hostname (RDS endpoint or IP)
- `EC2_X_DB_NAME`: Database name (`locationtracker`)
- `EC2_X_DB_USER`: Database username
- `EC2_X_DB_PASSWORD`: Database password

**SSL Secrets:**
- `EC2_X_SSL_CERT`: SSL certificate content (entire .crt file)
- `EC2_X_SSL_KEY`: SSL private key content (entire .key file)

### Example Secret Values

```
EC2_1_HOST=44.215.81.185
EC2_1_USER=ec2-user
EC2_1_DOMAIN=yourdomain.com
EC2_1_DB_HOST=your-db.region.rds.amazonaws.com
EC2_1_DB_NAME=locationtracker
EC2_1_DB_USER=dbuser
EC2_1_DB_PASSWORD=your_secure_password
EC2_1_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
[entire SSH private key content]
-----END OPENSSH PRIVATE KEY-----
EC2_1_SSL_CERT=-----BEGIN CERTIFICATE-----
[entire SSL certificate content]
-----END CERTIFICATE-----
EC2_1_SSL_KEY=-----BEGIN PRIVATE KEY-----
[entire SSL private key content]
-----END PRIVATE KEY-----
```

## 📁 Project Structure

```
location-tracker/
├── .github/
│   └── workflows/
│       ├── deploy-main.yml      # Main branch deployment
│       ├── deploy-feature.yml   # Feature branch deployment
│       └── cleanup-feature.yml  # Feature branch cleanup
├── static/
│   └── index.html              # Web interface (template)
├── main.go                     # Go application
├── go.mod                      # Go dependencies
├── go.sum                      # Go dependency checksums
├── Dockerfile                  # Container build instructions
├── docker-compose.yml          # Local development setup
└── README.md                   # This file
```

## 🚢 Deployment Workflows

### 1. Main Branch Deployment

**Trigger**: Push to `main` branch or manual dispatch
**Access URL**: `https://yourdomain.com/`

The main branch deployment:
- Builds and deploys to port 8080
- Updates unified Nginx configuration
- Preserves existing feature branch routes
- Automatic deployment on push to main

### 2. Feature Branch Deployment

**Trigger**: Manual dispatch only
**Access URL**: `https://yourdomain.com/test/<branch-name>/`

To deploy a feature branch:
1. Go to Actions tab in GitHub
2. Select "Deploy Feature Branch"
3. Click "Run workflow"
4. Enter branch name and select target instances
5. Click "Run workflow"

Feature branches:
- Deploy to port 8081
- Accessible at `/test/<branch-name>/` path
- Independent database connection
- Can run alongside main branch

### 3. Feature Branch Cleanup

**Trigger**: Manual dispatch only

To clean up a feature branch:
1. Go to Actions tab in GitHub
2. Select "Cleanup Feature Branch"
3. Click "Run workflow"
4. Enter branch name and select instances to clean
5. Click "Run workflow"

Cleanup process:
- Stops and removes containers
- Removes Docker images
- Cleans Nginx configuration
- Frees up ports
- Removes temporary files

## 🔧 Local Development

### Using Docker Compose

```bash
# Clone repository
git clone <your-repo-url>
cd location-tracker

# Create environment file
cp .env.example .env
# Edit .env with your database credentials

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Direct Go Development

```bash
# Install dependencies
go mod download

# Run with environment variables
DB_HOST=localhost \
DB_NAME=locationtracker \
DB_USER=postgres \
DB_PASSWORD=password \
PORT=8080 \
UDP_PORT=5051 \
go run main.go
```

## 📡 GPS Device Integration

### UDP Protocol Format

Send GPS coordinates via UDP to port 5051 (main) or 5052 (feature):

```
Format: device_id,latitude,longitude
Example: DEVICE001,40.7128,-74.0060
```

### Example Integration

**Python Client:**
```python
import socket
import time

def send_location(device_id, lat, lon, host='your-domain.com', port=5051):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    message = f"{device_id},{lat},{lon}"
    sock.sendto(message.encode(), (host, port))
    sock.close()

# Example usage
send_location("DEVICE001", 40.7128, -74.0060)
```

**Arduino/ESP32:**
```cpp
#include <WiFi.h>
#include <WiFiUdp.h>

WiFiUDP udp;

void sendLocation(String deviceId, float lat, float lon) {
    udp.beginPacket("your-domain.com", 5051);
    udp.print(deviceId + "," + String(lat, 6) + "," + String(lon, 6));
    udp.endPacket();
}
```

## 🔍 Monitoring and Troubleshooting

### Health Check Endpoints

- **Main Application**: `https://yourdomain.com/api/health`
- **Feature Branch**: `https://yourdomain.com/test/<branch>/api/health`
- **Statistics**: `https://yourdomain.com/api/stats`

### Common Issues

**1. Database Connection Failed**
```bash
# Check database connectivity
docker exec container_name sh -c 'PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"'

# Verify credentials in GitHub secrets
# Check security groups allow database port
```

**2. SSL Certificate Issues**
```bash
# Verify certificate files
sudo openssl x509 -in /etc/ssl/certs/location-tracker.crt -text -noout
sudo openssl rsa -in /etc/ssl/private/location-tracker.key -check

# Check Nginx configuration
sudo nginx -t
```

**3. Port Conflicts**
```bash
# Check what's using ports
sudo lsof -i :8080
sudo lsof -i :8081
sudo lsof -i :5051
sudo lsof -i :5052

# Kill conflicting processes
sudo kill -9 <PID>
```

**4. Feature Branch 404 Errors**
```bash
# Check Nginx configuration contains feature paths
sudo grep -A 10 "/test/" /etc/nginx/conf.d/location-tracker-unified.conf

# Manually reload Nginx
sudo systemctl reload nginx
```

### Log Locations

- **Application Logs**: `docker logs <container_name>`
- **Nginx Logs**: `/var/log/nginx/error.log`, `/var/log/nginx/access.log`
- **System Logs**: `journalctl -u nginx -f`

## 🛡️ Security Considerations

### Network Security
- Use VPC with private subnets for database
- Restrict security groups to necessary ports only
- Enable CloudWatch monitoring
- Implement WAF rules for web application firewall

### Application Security
- Regular dependency updates
- Input validation on GPS coordinates
- Rate limiting on UDP endpoints
- Database connection encryption (SSL mode required)

### SSL/TLS
- Use strong cipher suites
- Implement HSTS headers
- Regular certificate renewal
- HTTP to HTTPS redirects

## 📈 Scaling Considerations

### Horizontal Scaling
- Add more EC2 instances behind load balancer
- Configure database read replicas
- Use ElastiCache for session storage
- Implement CDN for static assets

### Vertical Scaling
- Increase instance sizes as needed
- Monitor CPU and memory usage
- Tune database connection pool sizes
- Optimize Docker resource limits

### Database Optimization
- Index on timestamp columns
- Archive old location data
- Implement connection pooling
- Monitor query performance

## 🔄 Backup and Recovery

### Database Backups
```bash
# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > backup_$(date +%Y%m%d).sql

# Restore backup
psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup_20240101.sql
```

### Configuration Backups
```bash
# Backup Nginx configuration
sudo cp /etc/nginx/conf.d/location-tracker-unified.conf ~/nginx-backup.conf

# Backup SSL certificates
sudo cp -r /etc/ssl/ ~/ssl-backup/
```

## 📞 Support

### Useful Commands

**Container Management:**
```bash
# List all location tracker containers
docker ps | grep location-tracker

# View container logs
docker logs -f location-tracker-main
docker logs -f location-tracker-feature-<branch>

# Restart containers
docker restart location-tracker-main

# Remove all stopped containers
docker container prune
```

**System Health:**
```bash
# Check port usage
sudo netstat -tuln | grep -E "(8080|8081|5051|5052)"

# Monitor system resources
htop
df -h
free -m

# Check Nginx status
sudo systemctl status nginx
```

This application provides a robust foundation for real-time GPS tracking with production-ready deployment automation and monitoring capabilities.