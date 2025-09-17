# Local Testing, HTTPS Setup, and AWS Deployment Guide

## 🧪 Local Testing Setup

### Prerequisites
```bash
# Install required tools
# 1. Go 1.21+
# 2. PostgreSQL
# 3. Git
```

### Step 1: Set Up Local Database
```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Create database and user
psql postgres
CREATE DATABASE locationtracker;
CREATE USER locationuser WITH PASSWORD 'localpassword';
GRANT ALL PRIVILEGES ON DATABASE locationtracker TO locationuser;
\q
```

### Step 2: Project Setup
```bash
# Create project directory
mkdir location-tracker
cd location-tracker

# Initialize Go module
go mod init location-tracker

# Install dependencies
go get github.com/gorilla/mux
go get github.com/gorilla/websocket
go get github.com/lib/pq
```

### Step 3: Create Project Structure
```
location-tracker/
├── main.go                 # Backend code
├── static/
│   └── index.html         # Frontend code
├── .env                   # Environment variables
├── docker-compose.yml     # For easy PostgreSQL setup
├── Dockerfile            # Container setup
└── README.md
```

### Step 4: Environment Configuration
Create `.env` file:
```bash
# .env
DB_HOST=localhost
DB_NAME=locationtracker
DB_USER=locationuser
DB_PASSWORD=localpassword
PORT=8000
UDP_PORT=8080
```

### Step 5: Docker Compose (Alternative Database Setup)
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:13
    environment:
      POSTGRES_DB: locationtracker
      POSTGRES_USER: locationuser
      POSTGRES_PASSWORD: localpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up -d
```

### Step 6: Create Static Directory
```bash
mkdir static
# Copy the frontend HTML code into static/index.html
```

### Step 7: Load Environment and Run
```bash
# Load environment variables (Linux/macOS)
export $(cat .env | xargs)

# Or create a run script
cat > run.sh << 'EOF'
#!/bin/bash
set -a
source .env
set +a
go run main.go
EOF

chmod +x run.sh
./run.sh
```

### Step 8: Test UDP Packet Reception
```bash
# In another terminal, send test UDP packets
echo "device123,40.7128,-74.0060" | nc -u localhost 8080
echo "device456,40.7589,-73.9851" | nc -u localhost 8080

# Or use Python script for continuous testing
cat > test_udp.py << 'EOF'
import socket
import time
import random

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
devices = ["device001", "device002", "device003"]

while True:
    device = random.choice(devices)
    lat = 40.7128 + (random.random() - 0.5) * 0.1
    lng = -74.0060 + (random.random() - 0.5) * 0.1
    
    message = f"{device},{lat:.6f},{lng:.6f}"
    sock.sendto(message.encode(), ("localhost", 8080))
    print(f"Sent: {message}")
    time.sleep(2)
EOF

python3 test_udp.py
```

### Step 9: Access Application
- Backend API: http://localhost:8000/api/health
- Frontend: http://localhost:8000
- WebSocket: ws://localhost:8000/ws

---

## 🔒 HTTPS Setup

### Method 1: Local Development with Self-Signed Certificates

#### Generate Self-Signed Certificates
```bash
# Create certificates directory
mkdir certs

# Generate private key
openssl genrsa -out certs/server.key 2048

# Generate certificate signing request
openssl req -new -key certs/server.key -out certs/server.csr \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -days 365 -in certs/server.csr \
  -signkey certs/server.key -out certs/server.crt

# Create combined certificate for easier deployment
cat certs/server.crt certs/server.key > certs/server.pem
```

#### Update Go Backend for HTTPS
Add to your main.go (in the APIServer struct):
```go
func (api *APIServer) RunHTTPS(ctx context.Context, certFile, keyFile string) {
    r := mux.NewRouter()
    
    // Same routes as before...
    r.HandleFunc("/api/health", api.healthHandler).Methods("GET")
    // ... other routes
    
    r.Use(corsMiddleware)
    api.server = &http.Server{
        Addr:         ":8443", // HTTPS port
        Handler:      r,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        TLSConfig: &tls.Config{
            MinVersion: tls.VersionTLS12,
        },
    }
    
    go func() {
        log.Printf("HTTPS server starting on port 8443")
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
```

Update the main function:
```go
func main() {
    // ... existing code
    
    // Check if certificates exist
    if _, err := os.Stat("certs/server.crt"); err == nil {
        log.Println("Certificates found, starting HTTPS server")
        go func() {
            defer wg.Done()
            app.apiServer.RunHTTPS(ctx, "certs/server.crt", "certs/server.key")
        }()
    } else {
        log.Println("No certificates found, starting HTTP server")
        go func() {
            defer wg.Done()
            app.apiServer.Run(ctx)
        }()
    }
    
    // ... rest of main function
}
```

#### Update Frontend for HTTPS
Update the WebSocket URL in the frontend:
```javascript
// In the frontend JavaScript
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${location.host}/ws`;
```

### Method 2: Using mkcert for Development
```bash
# Install mkcert
brew install mkcert  # macOS
# or
curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest \
| grep browser_download_url \
| grep linux-amd64 \
| cut -d '"' -f 4 \
| wget -qi - \
&& chmod +x mkcert-v*-linux-amd64 \
&& sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# Install local CA
mkcert -install

# Generate certificates
mkdir certs
mkcert -key-file certs/server.key -cert-file certs/server.crt localhost 127.0.0.1
```

---

## ☁️ AWS Deployment Guide

### Prerequisites
```bash
# Install AWS CLI and Terraform
brew install awscli terraform  # macOS
# Configure AWS credentials
aws configure
```

### Step 1: Prepare Infrastructure Code

Create `terraform/` directory:
```bash
mkdir terraform
cd terraform
```

#### terraform/variables.tf
```hcl
variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  default     = "location-tracker"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "key_name" {
  description = "EC2 Key Pair name"
  type        = string
}

variable "domain_name" {
  description = "Domain name for SSL certificate"
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment name"
  default     = "production"
}
```

#### terraform/outputs.tf
```hcl
output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB Zone ID"
  value       = aws_lb.main.zone_id
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.postgresql.endpoint
  sensitive   = true
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "security_group_ids" {
  description = "Security Group IDs"
  value = {
    alb = aws_security_group.alb.id
    ec2 = aws_security_group.ec2.id
    rds = aws_security_group.rds.id
  }
}
```

#### terraform/terraform.tfvars.example
```hcl
aws_region = "us-east-1"
project_name = "location-tracker"
db_password = "YourSecurePassword123!"
key_name = "your-key-pair-name"
domain_name = "yourdomain.com"  # Optional
environment = "production"
```

### Step 2: SSL Certificate Setup

#### Option 1: AWS Certificate Manager (Recommended)
```hcl
# Add to terraform/main.tf

# SSL Certificate
resource "aws_acm_certificate" "main" {
  count             = var.domain_name != "" ? 1 : 0
  domain_name       = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-cert"
  }
}

# Certificate validation
resource "aws_acm_certificate_validation" "main" {
  count           = var.domain_name != "" ? 1 : 0
  certificate_arn = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [
    for record in aws_route53_record.cert_validation : record.fqdn
  ]
}

# Route53 zone (if you have a domain)
data "aws_route53_zone" "main" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
}

# DNS validation records
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main[0].zone_id
}

# Update ALB Listener for HTTPS
resource "aws_lb_listener" "app_https" {
  count             = var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate_validation.main[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Redirect HTTP to HTTPS
resource "aws_lb_listener" "app_http_redirect" {
  count             = var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
```

### Step 3: User Data Script for EC2 Instances

#### terraform/user_data.sh
```bash
#!/bin/bash
set -e

# Update system
yum update -y

# Install required packages
yum install -y docker git

# Start Docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Go
cd /tmp
wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile

# Install CloudWatch agent
yum install -y amazon-cloudwatch-agent

# Create application directory
mkdir -p /opt/location-tracker/{certs,static,logs}
cd /opt/location-tracker

# Create SSL certificates (self-signed for internal use)
openssl req -x509 -newkey rsa:4096 -keyout certs/server.key -out certs/server.crt \
  -days 365 -nodes -subj "/CN=localhost"

# Download application from S3 (you'll upload it there)
aws s3 cp s3://your-deployment-bucket/location-tracker ./location-tracker
aws s3 cp s3://your-deployment-bucket/index.html ./static/
chmod +x location-tracker

# Create environment file
cat > .env << EOF
DB_HOST=${db_host}
DB_NAME=${db_name}
DB_USER=${db_user}
DB_PASSWORD=${db_password}
PORT=8000
UDP_PORT=8080
ENVIRONMENT=production
EOF

# Create systemd service
cat > /etc/systemd/system/location-tracker.service << 'EOF'
[Unit]
Description=Location Tracker Service
After=network.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/location-tracker
EnvironmentFile=/opt/location-tracker/.env
ExecStart=/opt/location-tracker/location-tracker
Restart=always
RestartSec=10
StandardOutput=append:/opt/location-tracker/logs/app.log
StandardError=append:/opt/location-tracker/logs/error.log

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/location-tracker

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
chown -R ec2-user:ec2-user /opt/location-tracker

# Enable and start service
systemctl enable location-tracker
systemctl start location-tracker

# Configure CloudWatch logs
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/opt/location-tracker/logs/app.log",
            "log_group_name": "/aws/ec2/location-tracker/app",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/opt/location-tracker/logs/error.log",
            "log_group_name": "/aws/ec2/location-tracker/error",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

### Step 4: Build and Upload Application

#### build_and_deploy.sh
```bash
#!/bin/bash
set -e

PROJECT_NAME="location-tracker"
S3_BUCKET="your-deployment-bucket-name"
AWS_REGION="us-east-1"

echo "Building application..."

# Build for Linux
GOOS=linux GOARCH=amd64 go build -o ${PROJECT_NAME} main.go

echo "Creating deployment package..."

# Create deployment directory
mkdir -p deploy/static
cp ${PROJECT_NAME} deploy/
cp static/index.html deploy/static/

echo "Uploading to S3..."

# Create S3 bucket if it doesn't exist
aws s3 mb s3://${S3_BUCKET} --region ${AWS_REGION} 2>/dev/null || true

# Upload files
aws s3 cp deploy/${PROJECT_NAME} s3://${S3_BUCKET}/
aws s3 cp deploy/static/index.html s3://${S3_BUCKET}/

echo "Deployment package uploaded to S3"

# Clean up
rm -rf deploy ${PROJECT_NAME}
```

### Step 5: Deploy Infrastructure

```bash
# Navigate to terraform directory
cd terraform

# Copy and customize variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Initialize Terraform
terraform init

# Plan deployment
terraform plan

# Apply infrastructure
terraform apply

# Note the ALB DNS name from output
```

### Step 6: DNS Setup (If using custom domain)

```bash
# Get ALB details
terraform output alb_dns_name
terraform output alb_zone_id

# Create Route53 record (if not using Terraform for DNS)
aws route53 change-resource-record-sets --hosted-zone-id YOUR_ZONE_ID --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "yourdomain.com",
      "Type": "A",
      "AliasTarget": {
        "DNSName": "your-alb-dns-name.us-east-1.elb.amazonaws.com",
        "EvaluateTargetHealth": false,
        "HostedZoneId": "Z35SXDOTRQ7X7K"
      }
    }
  }]
}'
```

### Step 7: Monitoring and Troubleshooting

#### Check Application Status
```bash
# SSH to an instance
ssh -i your-key.pem ec2-user@instance-ip

# Check service status
sudo systemctl status location-tracker

# View logs
sudo journalctl -u location-tracker -f
tail -f /opt/location-tracker/logs/app.log

# Test health endpoints
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/udp
curl http://localhost:8000/api/health/db
```

#### CloudWatch Monitoring
```bash
# View logs in CloudWatch
aws logs describe-log-groups --log-group-name-prefix "/aws/ec2/location-tracker"

# Check metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=app/location-tracker-alb/1234567890abcdef \
  --statistics Average \
  --start-time 2023-01-01T00:00:00Z \
  --end-time 2023-01-01T23:59:59Z \
  --period 3600
```

### Step 8: Application Updates

#### update_application.sh
```bash
#!/bin/bash
set -e

S3_BUCKET="your-deployment-bucket-name"
ASG_NAME="location-tracker-asg"

echo "Building and uploading new version..."
./build_and_deploy.sh

echo "Triggering instance refresh..."
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name ${ASG_NAME} \
  --preferences '{"InstanceWarmup": 300, "MinHealthyPercentage": 50}'

echo "Monitoring refresh progress..."
aws autoscaling describe-instance-refreshes \
  --auto-scaling-group-name ${ASG_NAME}
```

---

## 🚀 Complete Deployment Checklist

### Pre-deployment
- [ ] AWS CLI configured
- [ ] EC2 Key Pair created
- [ ] Domain name configured (optional)
- [ ] S3 bucket for deployments created

### Infrastructure Deployment
- [ ] Terraform variables configured
- [ ] Infrastructure deployed with `terraform apply`
- [ ] SSL certificate validated (if using custom domain)
- [ ] DNS records created

### Application Deployment
- [ ] Application built and uploaded to S3
- [ ] EC2 instances launched and configured
- [ ] Health checks passing
- [ ] Load balancer routing traffic

### Testing
- [ ] Frontend accessible via HTTPS
- [ ] WebSocket connections working
- [ ] UDP packets being received and processed
- [ ] Leader election functioning
- [ ] Database connections healthy

### Monitoring
- [ ] CloudWatch logs configured
- [ ] Alarms set up for key metrics
- [ ] Health check endpoints monitored

This comprehensive guide covers everything from local development to production deployment with HTTPS, monitoring, and automated updates!
