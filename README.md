# GitHub Secrets Setup Guide

## Required Secrets for Each EC2 Instance

For each EC2 instance (EC2_1, EC2_2, EC2_3, EC2_4), you need to configure the following secrets in your GitHub repository:

### Basic Server Configuration
```
EC2_1_HOST=your-server-ip-or-domain
EC2_1_USER=ec2-user
EC2_1_SSH_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
your-private-ssh-key-content-here
-----END OPENSSH PRIVATE KEY-----
```

### Database Configuration
```
EC2_1_DB_HOST=your-database-host
EC2_1_DB_NAME=your-database-name
EC2_1_DB_USER=your-database-username
EC2_1_DB_PASSWORD=your-database-password
```

### Domain Configuration
```
EC2_1_DOMAIN=yourdomain.com
```

### SSL Certificate Configuration (NEW)
```
EC2_1_SSL_CERT=-----BEGIN CERTIFICATE-----
your-ssl-certificate-content-here
-----END CERTIFICATE-----

EC2_1_SSL_KEY=-----BEGIN PRIVATE KEY-----
your-ssl-private-key-content-here
-----END PRIVATE KEY-----
```

## Complete Example for EC2_1

### Server & Database Secrets
- `EC2_1_HOST`: `198.51.100.1` (or `myapp.example.com`)
- `EC2_1_USER`: `ec2-user`
- `EC2_1_SSH_KEY`: 
  ```
  -----BEGIN OPENSSH PRIVATE KEY-----
  b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAFwAAAAdzc2gtcn...
  -----END OPENSSH PRIVATE KEY-----
  ```

### Database Secrets
- `EC2_1_DB_HOST`: `mydb.cluster-xyz.us-west-2.rds.amazonaws.com`
- `EC2_1_DB_NAME`: `locationtracker`
- `EC2_1_DB_USER`: `dbuser`
- `EC2_1_DB_PASSWORD`: `SecurePassword123!`

### Domain & SSL Secrets
- `EC2_1_DOMAIN`: `api.mycompany.com`
- `EC2_1_SSL_CERT`:
  ```
  -----BEGIN CERTIFICATE-----
  MIIFXzCCA0egAwIBAgIUQv3KWq8VRz0LmN5rY8X9Px4lB2owDQYJKoZIhvcNAQEL...
  -----END CERTIFICATE-----
  ```
- `EC2_1_SSL_KEY`:
  ```
  -----BEGIN PRIVATE KEY-----
  MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDNqR6oFVMc8X9Z...
  -----END PRIVATE KEY-----
  ```

## How to Add Secrets to GitHub

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret with the exact name format shown above

## SSL Certificate Formats

### Certificate Chain Order
If you have a certificate chain, include them in this order in the `SSL_CERT` secret:
```
-----BEGIN CERTIFICATE-----
[Your domain certificate]
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
[Intermediate certificate]
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
[Root certificate (optional)]
-----END CERTIFICATE-----
```

### Private Key Format
Make sure your private key is in PEM format. If you have a different format, convert it:

**From PKCS#1 to PKCS#8 (if needed):**
```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in oldkey.pem -out newkey.pem
```

**From .p12/.pfx to separate files:**
```bash
# Extract certificate
openssl pkcs12 -in certificate.p12 -clcerts -nokeys -out certificate.crt

# Extract private key
openssl pkcs12 -in certificate.p12 -nocerts -nodes -out private.key
```

## Security Considerations

### Private Key Security
- Never commit private keys to your repository
- Use GitHub Secrets (they are encrypted at rest)
- Rotate certificates before expiration
- Use separate certificates for production vs staging if possible

### SSH Key Security
- Use dedicated deploy keys (not your personal SSH key)
- Generate keys specifically for deployment:
  ```bash
  ssh-keygen -t rsa -b 4096 -f deploy_key -C "github-actions-deploy"
  ```
- Add the public key (`deploy_key.pub`) to your server's `~/.ssh/authorized_keys`
- Add the private key (`deploy_key`) to GitHub Secrets

## Certificate Validation

After deployment, you can validate your SSL setup:

### Check Certificate Installation
```bash
# Test SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Check certificate expiration
echo | openssl s_client -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Test HTTPS Redirect
```bash
curl -I http://yourdomain.com
# Should return: HTTP/1.1 301 Moved Permanently
```

## Troubleshooting

### Common Issues

1. **Certificate format errors**: Ensure proper PEM format with correct headers/footers
2. **Permission issues**: The workflow sets proper permissions (644 for cert, 600 for key)
3. **Nginx configuration**: The workflow automatically configures Nginx based on certificate availability
4. **Certificate chain issues**: Include intermediate certificates in the correct order

### Debug Commands

If deployment fails, check these on your server:

```bash
# Check certificate files exist
ls -la /etc/ssl/certs/location-tracker.crt
ls -la /etc/ssl/private/location-tracker.key

# Test Nginx configuration
sudo nginx -t

# Check systemd service status
sudo systemctl status location-tracker@main

# View application logs
sudo journalctl -u location-tracker@main -f
```

## Benefits of This Approach

✅ **Secure**: Certificates stored in encrypted GitHub Secrets  
✅ **Automated**: No manual certificate deployment needed  
✅ **Flexible**: Works with or without SSL certificates  
✅ **Centralized**: All secrets managed in one place  
✅ **Auditable**: GitHub tracks secret usage  
✅ **Scalable**: Easy to add more instances  

## Multiple Instances Example

For multiple EC2 instances, repeat the same pattern:

```
# EC2_1 secrets
EC2_1_HOST, EC2_1_USER, EC2_1_SSH_KEY, EC2_1_SSL_CERT, EC2_1_SSL_KEY...

# EC2_2 secrets  
EC2_2_HOST, EC2_2_USER, EC2_2_SSH_KEY, EC2_2_SSL_CERT, EC2_2_SSL_KEY...

# EC2_3 secrets
EC2_3_HOST, EC2_3_USER, EC2_3_SSH_KEY, EC2_3_SSL_CERT, EC2_3_SSL_KEY...

# EC2_4 secrets
EC2_4_HOST, EC2_4_USER, EC2_4_SSH_KEY, EC2_4_SSL_CERT, EC2_4_SSL_KEY...
```

Each instance can have:
- Same certificates (for load balancer scenarios)
- Different certificates (for different domains/subdomains)
- No certificates (HTTP only)