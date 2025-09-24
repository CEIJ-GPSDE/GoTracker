# Build stage
FROM golang:1.25.1-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-X main.Version=${VERSION}" -o app main.go

# Runtime stage
FROM alpine:latest

# Install ca-certificates for HTTPS requests and postgresql-client for health checks
RUN apk --no-cache add ca-certificates postgresql-client gettext

WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/app .
COPY --from=builder /app/static ./static-template/

# Create directory for certificates and ensure static directory exists
RUN mkdir -p certs static

# Set build-time arguments
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}

# Create entrypoint script that processes templates
RUN echo '#!/bin/sh' > /root/entrypoint.sh && \
    echo 'set -e' >> /root/entrypoint.sh && \
    echo 'echo "Processing static file templates with BASE_PATH: ${BASE_PATH}"' >> /root/entrypoint.sh && \
    echo '' >> /root/entrypoint.sh && \
    echo '# Ensure static directory exists' >> /root/entrypoint.sh && \
    echo 'mkdir -p /root/static' >> /root/entrypoint.sh && \
    echo '' >> /root/entrypoint.sh && \
    echo '# Copy template files to static directory' >> /root/entrypoint.sh && \
    echo 'if [ -d "/root/static-template" ]; then' >> /root/entrypoint.sh && \
    echo '    echo "Copying static template files..."' >> /root/entrypoint.sh && \
    echo '    cp -r /root/static-template/* /root/static/ 2>/dev/null || echo "No template files to copy"' >> /root/entrypoint.sh && \
    echo 'else' >> /root/entrypoint.sh && \
    echo '    echo "Warning: static-template directory not found"' >> /root/entrypoint.sh && \
    echo 'fi' >> /root/entrypoint.sh && \
    echo '' >> /root/entrypoint.sh && \
    echo '# Process index.html template if it exists' >> /root/entrypoint.sh && \
    echo 'if [ -f "/root/static/index.html" ]; then' >> /root/entrypoint.sh && \
    echo '    echo "Found index.html, processing template variables..."' >> /root/entrypoint.sh && \
    echo '    echo "BASE_PATH value: [${BASE_PATH}]"' >> /root/entrypoint.sh && \
    echo '    # Replace template variables in index.html' >> /root/entrypoint.sh && \
    echo '    if command -v envsubst >/dev/null 2>&1; then' >> /root/entrypoint.sh && \
    echo '        envsubst '\''${BASE_PATH}'\'' < /root/static/index.html > /root/static/index.html.tmp' >> /root/entrypoint.sh && \
    echo '        mv /root/static/index.html.tmp /root/static/index.html' >> /root/entrypoint.sh && \
    echo '        echo "Processed index.html with envsubst"' >> /root/entrypoint.sh && \
    echo '    else' >> /root/entrypoint.sh && \
    echo '        echo "Warning: envsubst not found, using sed fallback"' >> /root/entrypoint.sh && \
    echo '        sed "s/\${BASE_PATH}/${BASE_PATH}/g" /root/static/index.html > /root/static/index.html.tmp' >> /root/entrypoint.sh && \
    echo '        mv /root/static/index.html.tmp /root/static/index.html' >> /root/entrypoint.sh && \
    echo '    fi' >> /root/entrypoint.sh && \
    echo '    echo "Template processing completed"' >> /root/entrypoint.sh && \
    echo 'else' >> /root/entrypoint.sh && \
    echo '    echo "Warning: index.html not found in static directory"' >> /root/entrypoint.sh && \
    echo '    ls -la /root/static/ || echo "Static directory is empty"' >> /root/entrypoint.sh && \
    echo 'fi' >> /root/entrypoint.sh && \
    echo '' >> /root/entrypoint.sh && \
    echo '# List final static directory contents' >> /root/entrypoint.sh && \
    echo 'echo "Final static directory contents:"' >> /root/entrypoint.sh && \
    echo 'ls -la /root/static/ || echo "No static directory found"' >> /root/entrypoint.sh && \
    echo '' >> /root/entrypoint.sh && \
    echo '# Start the application' >> /root/entrypoint.sh && \
    echo 'echo "Starting application..."' >> /root/entrypoint.sh && \
    echo 'exec ./app' >> /root/entrypoint.sh

RUN chmod +x /root/entrypoint.sh

# Expose ports
EXPOSE 8080 8443 5051 5052 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/health || exit 1

# Use entrypoint script
ENTRYPOINT ["/root/entrypoint.sh"]