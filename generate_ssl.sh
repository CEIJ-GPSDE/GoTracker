#!/bin/bash

# Generate SSL certificates for HTTPS
# This creates self-signed certificates - for production, use proper CA-signed certificates

echo "Generating SSL certificates..."

# Generate private key
openssl genrsa -out server.key 2048

# Generate certificate signing request
openssl req -new -key server.key -out server.csr -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Clean up CSR file
rm server.csr

# Set appropriate permissions
chmod 600 server.key
chmod 644 server.crt

echo "✅ SSL certificates generated:"
echo "   - server.key (private key)"
echo "   - server.crt (certificate)"
echo ""
echo "⚠️  These are self-signed certificates for development/testing."
echo "   For production, obtain certificates from a trusted CA."
echo ""
echo "🚀 Now you can run the server with HTTPS:"
echo "   go run main.go -https -port 8443"
