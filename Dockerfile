# Build stage
FROM golang:1.21-alpine AS builder

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
RUN apk --no-cache add ca-certificates postgresql-client

WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/app .
COPY --from=builder /app/static ./static/

# Create directory for certificates (optional)
RUN mkdir -p certs

# Expose ports
EXPOSE 8080 8443 5051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/health || exit 1

# Run the application
CMD ["./app"]