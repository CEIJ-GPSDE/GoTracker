export class ClusteringManager {
  constructor(mapManager) {
    this.mapManager = mapManager;
    this.map = mapManager.map;
    this.clusterSourceId = 'locations-cluster';
    this.useClusteringThreshold = 100; // Use clustering when more than 100 points
  }

  initialize() {
    // Add cluster source
    this.map.addSource(this.clusterSourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });

    // Cluster circles
    this.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: this.clusterSourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#51bbd6', 100,
          '#f1f075', 300,
          '#f28cb1'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          20, 100,
          30, 300,
          40
        ]
      }
    });

    // Cluster count labels
    this.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: this.clusterSourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      }
    });

    // Unclustered points
    this.map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: this.clusterSourceId,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    // Click handlers
    this.map.on('click', 'clusters', (e) => {
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: ['clusters']
      });
      const clusterId = features[0].properties.cluster_id;
      this.map.getSource(this.clusterSourceId).getClusterExpansionZoom(
        clusterId,
        (err, zoom) => {
          if (err) return;
          this.map.easeTo({
            center: features[0].geometry.coordinates,
            zoom: zoom
          });
        }
      );
    });

    this.map.on('click', 'unclustered-point', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const properties = e.features[0].properties;
      
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(`
          <div style="font-family: system-ui; min-width: 200px;">
            <h4 style="margin: 0 0 10px 0; color: #374151;">
              ${properties.device_id}
            </h4>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
              <strong>Coordinates:</strong><br>
              ${parseFloat(properties.latitude).toFixed(6)}, ${parseFloat(properties.longitude).toFixed(6)}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              <strong>Time:</strong><br>
              ${new Date(properties.timestamp).toLocaleString()}
            </div>
          </div>
        `)
        .addTo(this.map);
    });

    // Change cursor
    this.map.on('mouseenter', 'clusters', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'clusters', () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  updateClusteredLocations(locations, devices) {
    const features = locations.map(loc => {
      const deviceInfo = devices.get(loc.device_id);
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [loc.longitude, loc.latitude]
        },
        properties: {
          device_id: loc.device_id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          timestamp: loc.timestamp,
          color: deviceInfo ? deviceInfo.color : '#3b82f6'
        }
      };
    });

    this.map.getSource(this.clusterSourceId).setData({
      type: 'FeatureCollection',
      features: features
    });
  }

  shouldUseClustering(locationCount) {
    return locationCount > this.useClusteringThreshold;
  }

  toggleClustering(enable) {
    const visibility = enable ? 'visible' : 'none';
    this.map.setLayoutProperty('clusters', 'visibility', visibility);
    this.map.setLayoutProperty('cluster-count', 'visibility', visibility);
    this.map.setLayoutProperty('unclustered-point', 'visibility', visibility);
  }
}
