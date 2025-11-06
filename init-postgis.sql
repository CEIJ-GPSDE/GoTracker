-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Drop existing locations table if you want to migrate
-- DROP TABLE IF EXISTS locations;

-- Create locations table with spatial column
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,  -- Uses WGS84 (GPS coordinates)
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Optional: keep original columns for compatibility during migration
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
);

-- Create spatial index (GIST)
CREATE INDEX IF NOT EXISTS idx_locations_geography ON locations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_locations_device_timestamp ON locations(device_id, timestamp DESC);

-- Geofences table (polygons or circles)
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    geom GEOGRAPHY(POLYGON, 4326) NOT NULL,  -- Polygon geofence
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST(geom);

-- Routes table (linestrings)
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    route_name VARCHAR(255),
    geom GEOGRAPHY(LINESTRING, 4326) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    distance_meters DECIMAL(12, 2),  -- Calculated distance
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_geom ON routes USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_routes_device ON routes(device_id);
CREATE INDEX IF NOT EXISTS idx_routes_time ON routes(start_time, end_time);

-- View to show locations with lat/lng for backward compatibility
CREATE OR REPLACE VIEW locations_view AS
SELECT 
    id,
    device_id,
    ST_Y(location::geometry) AS latitude,
    ST_X(location::geometry) AS longitude,
    location,
    timestamp,
    created_at
FROM locations;
