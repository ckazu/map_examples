const CONFIG = {
  DEFAULT_LAT: 35.68963,
  DEFAULT_LNG: 139.69165,
  DEFAULT_ZOOM: 16,
  MIN_ZOOM: 1,
  MAX_ZOOM: 22,
  DEFAULT_RESOLUTION: 8,
  MAX_CELLS: 30,
  COLORS: ['green', 'red', 'blue', 'purple', 'orange'],
  SHOW_FILL_COLOR: true,
  SHOW_INDEX: false,
  SHOW_COORDINATES: false,
};

class HexagonMap {
  constructor(map, config) {
    this.map = map;
    this.config = config;
    this.currentHexagons = [];
    this.resolutions = [config.DEFAULT_RESOLUTION];
    this.highestResolution = config.DEFAULT_RESOLUTION;
    this.maxCells = config.MAX_CELLS;
    this.showFillColor = config.SHOW_FILL_COLOR;
    this.showIndex = config.SHOW_INDEX;
    this.showCoordinates = config.SHOW_COORDINATES;
    this.colorMap = new Map();
  }

  static normalizeLongitudeTo360(boundary) {
    return boundary.map(([lng, lat]) => {
      if (lng < 0) lng += 360;
      return [lng, lat];
    });
  }

  drawHexagons() {
    this.currentHexagons.forEach(layer => this.map.removeLayer(layer));
    this.currentHexagons = [];

    const center = this.map.getCenter();
    const centerLat = center.lat;
    const centerLng = center.lng;

    const sortedResolutions = [...this.resolutions].sort((a, b) => a - b);
    this.highestResolution = Math.max(...this.resolutions);

    if (sortedResolutions.length > 1) {
      const lowestResolution = sortedResolutions[0];
      const h3Index = window.h3.geoToH3(centerLat, centerLng, lowestResolution);
      const baseHexagons = window.h3.kRing(h3Index, this.config.MAX_CELLS);

      this.colorMap.clear();
      baseHexagons.forEach(hex => {
        this.colorMap.set(hex, this.getRandomColor());
      });
    }

    sortedResolutions.forEach(resolution => {
      const h3Index = window.h3.geoToH3(centerLat, centerLng, resolution);
      const hexagons = window.h3.kRing(h3Index, this.config.MAX_CELLS);

      hexagons.forEach(hex => {
        let hexBoundary = window.h3.h3ToGeoBoundary(hex, true);

        if (hexBoundary.some(([lng]) => lng > 90 || lng < -90)) {
          hexBoundary = HexagonMap.normalizeLongitudeTo360(hexBoundary);
        }

        // 内側に縮小した境界を取得
        const scaledBoundary = this.scaleBoundary(hexBoundary, 0.99);

        let fillColor;
        if (sortedResolutions.length > 1) {
          const baseHex = window.h3.h3ToParent(hex, sortedResolutions[0]);
          fillColor = this.colorMap.get(baseHex) || this.getRandomColor();
        } else {
          fillColor = this.getRandomColor();
        }

        const polygon = scaledBoundary.map(([lng, lat]) => [lat, lng]);
        this.addPolygon(polygon, fillColor);

        if (this.showIndex) {
          const hexCenter = window.h3.h3ToGeo(hex);
          this.addIndexMarker(hexCenter, hex);
        }
      });
    });
  }

  scaleBoundary(boundary, scaleFactor) {
    const center = this.getPolygonCenter(boundary);
    return boundary.map(([lng, lat]) => {
      const scaledLat = center[1] + (lat - center[1]) * scaleFactor;
      const scaledLng = center[0] + (lng - center[0]) * scaleFactor;
      return [scaledLng, scaledLat];
    });
  }

  getPolygonCenter(boundary) {
    const total = boundary.length;
    const sum = boundary.reduce(
      (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
      [0, 0]
    );
    return [sum[0] / total, sum[1] / total];
  }

  addPolygon(latlngs, color) {
    let fillColor = color;
    if (!this.showFillColor) { fillColor = 'transparent'; }
    const polygon = L.polygon(latlngs, {
      color: color,
      opacity: 0.5,
      fillColor: fillColor,
      fillOpacity: 0.08,
      weight: 2,
    }).addTo(this.map);
    this.currentHexagons.push(polygon);
  }

  getRandomColor() {
    return this.config.COLORS[Math.floor(Math.random() * this.config.COLORS.length)];
  }

  setMaxCells(newMaxCells) {
    this.maxCells = newMaxCells;
    this.drawHexagons();
  }

  setResolutions(newResolutions) {
    this.resolutions = newResolutions;
    this.drawHexagons();
  }

  addVertexMarkers(boundary) {
    if (!this.showCoordinates) return;
    boundary.forEach(([lng, lat]) => {
      const coordinateLabel = L.divIcon({
        className: 'vertex-label',
        html: `<div style="font-size: 10px; color: blue;">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>`,
      });
      const marker = L.marker([lat, lng], { icon: coordinateLabel }).addTo(this.map);
      this.currentHexagons.push(marker);
    });
  }

  addIndexMarker(center, index) {
    const h3Label = L.divIcon({
      className: 'h3-label',
      html: `<div style="text-align: center; font-size: 10px; color: black;">${index}</div>`,
    });
    const marker = L.marker([center[0], center[1]], { icon: h3Label }).addTo(this.map);
    this.currentHexagons.push(marker);
  }

  handleMapClick(lat, lng) {
    const h3Index = window.h3.geoToH3(lat, lng, this.highestResolution);
    const [centerLat, centerLng] = window.h3.h3ToGeo(h3Index);

    const cellColor = this.colorMap.get(h3Index) || 'gray';
    this.addMarkerAtHexCenter(centerLat, centerLng, cellColor);
  }

  addMarkerAtHexCenter(lat, lng, color) {
    L.marker([lat, lng]).addTo(this.map);
  }

  getRandomColor() {
    return this.config.COLORS[Math.floor(Math.random() * this.config.COLORS.length)];
  }

  setResolution(newResolution) {
    this.resolution = newResolution;
    this.drawHexagons();
  }

  toggleFillColorDisplay(value) {
    this.showFillColor = value;
    this.drawHexagons();
  }

  toggleIndexDisplay(value) {
    this.showIndex = value;
    this.drawHexagons();
  }

  toggleCoordinatesDisplay(value) {
    this.showCoordinates = value;
    this.drawHexagons();
  }

  // 解像度の設定を変更
  setResolutions(newResolutions) {
    this.resolutions = newResolutions;
    this.drawHexagons();
  }
}

const map = L.map('map', {
  minZoom: CONFIG.MIN_ZOOM,
  maxZoom: CONFIG.MAX_ZOOM,
}).setView([CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG], CONFIG.DEFAULT_ZOOM);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: CONFIG.MAX_ZOOM,
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

function updateZoomLevel() {
  const zoomLevel = map.getZoom();
  document.getElementById('zoom-level').textContent = zoomLevel;
}

function addMarkerAtHexCenter(lat, lng) {
  const h3Index = window.h3.geoToH3(lat, lng, HIGHEST_RESOLUTION);
  const [centerLat, centerLng] = window.h3.h3ToGeo(h3Index);
  L.marker([centerLat, centerLng]).addTo(map);
}

const hexagonMap = new HexagonMap(map, CONFIG);

map.on('moveend', () => { hexagonMap.drawHexagons(); });
map.on('zoomend', updateZoomLevel);
map.on('click', (e) => {
  const { lat, lng } = e.latlng;
  hexagonMap.handleMapClick(lat, lng);
});

document.querySelectorAll('.resolution-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    const selectedResolutions = Array.from(document.querySelectorAll('.resolution-checkbox:checked'))
      .map(input => parseInt(input.value, 10));
    hexagonMap.setResolutions(selectedResolutions);
  });
});

document.getElementById('show-fill-color-checkbox').addEventListener('change', (event) => {
  hexagonMap.toggleFillColorDisplay(event.target.checked);
});

document.getElementById("show-index-checkbox").addEventListener("change", (event) => {
  hexagonMap.toggleIndexDisplay(event.target.checked);
});

document.getElementById("show-coordinates-checkbox").addEventListener("change", (event) => {
  hexagonMap.toggleCoordinatesDisplay(event.target.checked);
});

document.getElementById('max-cells-slider').addEventListener('input', (event) => {
  const maxCells = parseInt(event.target.value, 10);
  document.getElementById('max-cells-value').textContent = maxCells;
  hexagonMap.setMaxCells(maxCells);
});

updateZoomLevel();
hexagonMap.drawHexagons();