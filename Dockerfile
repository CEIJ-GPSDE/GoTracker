# -------- Stage 1: Build --------
FROM golang:1.25.1-alpine AS builder
RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN go build -o location-tracker .

# -------- Stage 2: Runtime --------
FROM alpine:3.18
RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /app/location-tracker .
COPY --from=builder /app/static ./static
COPY --from=builder /app/certs ./certs

# Expose ports
EXPOSE 443
EXPOSE 5051/udp

CMD ["./location-tracker"]
