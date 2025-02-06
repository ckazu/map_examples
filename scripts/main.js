const CONFIG = {
  DEFAULT_LAT: 35.6868653, // 35.68963,
  DEFAULT_LNG: 139.7011946, //139.69165,
  DEFAULT_ZOOM: 19,
  MIN_ZOOM: 1,
  MAX_ZOOM: 22,
  DEFAULT_RESOLUTION: 17,
  MAX_CELLS: 100,
  COLORS: ['khaki', 'cyan', 'blue', 'pink'],
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
    this.mode = 'S2';
  }

  static normalizeLongitudeTo360(boundary) {
    return boundary.map(([lng, lat]) => {
      if (lng < 0) lng += 360;
      return [lng, lat];
    });
  }

  resetCellsAndMarkers() {
    this.currentHexagons.forEach(layer => {
      if (layer instanceof L.Polygon) {
        layer.off('mouseover');
        layer.off('mouseout');
        layer.unbindTooltip();
        if (layer.statsMarker) {
          this.map.removeLayer(layer.statsMarker);
          layer.statsMarker = null;
        }
      }
      this.map.removeLayer(layer);
    });
    // リセット後、配列を空にする
    this.currentHexagons = [];
  }

  drawHexagons() {
    if (this.isDrawing) {
      console.log("描画処理中のため、新たな描画処理は実行されません。");
      return;
    }
    this.isDrawing = true;

    this.currentHexagons.forEach(polygon => {
      polygon.closeTooltip();
    });

    const drawProcess = async () => {
      try {
        if (this.mode === 'H3') {
          this.drawH3Hexagons();
        } else if (this.mode === 'S2') {
          await this.drawS2Cells();
        }
      } catch (error) {
        console.error("描画中にエラーが発生しました:", error);
      } finally {
        this.isDrawing = false;
      }
    };
    drawProcess();
  }

  async drawS2Cells() {
    const api = new Api();

    const center = this.map.getCenter();
    const centerLat = center.lat;
    const centerLng = center.lng;

    const sortedResolutions = [...this.resolutions].sort((a, b) => a - b);
    this.highestResolution = Math.max(...this.resolutions);

    if (sortedResolutions.length > 1) {
      const lowestResolution = sortedResolutions[0];
      const latLng = S2LatLng.from(centerLat, centerLng);
      const cell = S2Cell.fromLatLng(latLng, lowestResolution);
      const baseCells = this.getS2Neighbors(cell, this.maxCells);

      this.colorMap.clear();
      baseCells.forEach(baseCell => {
        const baseKey = baseCell.toInteger();
        this.colorMap.set(baseKey, this.getRandomColor());
      });
    }

    for (const resolution of sortedResolutions) {
      const latLng = S2LatLng.from(centerLat, centerLng);
      const cell = S2Cell.fromLatLng(latLng, resolution);
      const cells = this.getS2Neighbors(cell, this.maxCells);
      const cell_ids = cells.map(cell => cell.toInteger().toString());

      // API request
      const fetch_cell_ids = cell_ids.filter(cell_id => {
        return !this.currentHexagons.some(polygon => polygon.options.cell_id === cell_id);
      });
      const cells_stats = await api.getCells(fetch_cell_ids);

      // draw cells
      for (const currentCell of cells) {
        const cell_id = currentCell.toInteger().toString();
        if (this.currentHexagons.find(polygon => polygon.options.cell_id === cell_id)) {
          continue;
        }

        const corners = Array.from(currentCell.getCornerLatLngs());

        const scaledCorners = this.scaleBoundary(
          corners.map(corner => [corner.lng, corner.lat]),
          0.99
        );

        const cell_stats = cells_stats.find(cell => cell.cell_id === cell_id);
        let stats = cell_stats;
        let fillColor = 'transparent';
        if (cell_stats) {
          fillColor = this.config.COLORS[cell_stats.level];
          if (cell_stats.level === 0 && cell_stats.score <= 0) {
            fillColor = 'gray';
          }
        }
        const polygon = scaledCorners.map(([lng, lat]) => [lat, lng]);
        this.addPolygon(cell_id, polygon, fillColor, stats);

        if (this.showIndex) {
          const center = currentCell.toLatLng();
          this.addIndexMarker([center.lat, center.lng], cell_id);
        }
      }
    }
    console.log(this.currentHexagons.length);
  }

  getS2Neighbors(cell, maxCells) {
    const neighbors = [cell];
    const visited = new Set();
    visited.add(cell.toInteger());

    const queue = [cell];
    while (queue.length > 0 && neighbors.length < maxCells) {
      const current = queue.shift();

      for (const neighbor of current.getNeighbors()) {
        const neighborId = neighbor.toInteger();
        if (!visited.has(neighborId)) {
          neighbors.push(neighbor);
          queue.push(neighbor);
          visited.add(neighborId);
        }

        if (neighbors.length >= maxCells) {
          break;
        }
      }
    }
    return neighbors;
  }

  drawH3Hexagons() {
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
        this.addPolygon("dummy", polygon, fillColor, null);

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

  addPolygon(cell_id, latlngs, color, stats) {
    let fillColor = color;
    if (!this.showFillColor) { fillColor = 'transparent'; }
    const polygon = L.polygon(latlngs, {
      cell_id: cell_id,
      stats: stats,
      color: "gray",
      opacity: 0.5,
      fillColor: fillColor,
      fillOpacity: 0.4,
      weight: 1.5,
    }).addTo(this.map);

    // // すでに cell_id が存在している場合はあらかじめ削除する
    // this.currentHexagons.forEach(polygon => {
    //   if (polygon.options.cell_id === cell_id) {
    //     polygon.remove();
    //   }
    // });

    this.currentHexagons.push(polygon);

    if (stats) {
      const center = polygon.getBounds().getCenter();
      const content = `level ${stats.level}<br/>score ${stats.score}`;
      const statsIcon = L.divIcon({
        className: 'stats-marker',
        html: `<pre style="margin:0;">${content}</pre>`,
        iconSize: [100, 50],
        iconAnchor: [20, 10]
      });
      const marker = L.marker(center, {
        icon: statsIcon,
        interactive: false
      }).addTo(this.map);
      polygon.statsMarker = marker;

      polygon.on('mouseover', (e) => {
        const content = typeof stats === 'object' ? JSON.stringify(stats, null, 2) : stats;
        polygon.bindTooltip(`<pre>${content}</pre>`, {
          permanent: false,
          direction: 'top',
          className: 'stats-tooltip'
        }).openTooltip(e.latlng);
      });

      polygon.on('mouseout', () => {
        polygon.closeTooltip();
      });
    }
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

  setMode(mode) {
    this.mode = mode;
    this.drawHexagons();
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
}

const map = L.map('map', {
  minZoom: CONFIG.MIN_ZOOM,
  maxZoom: CONFIG.MAX_ZOOM,
}).setView([CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG], CONFIG.DEFAULT_ZOOM);

// L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
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

async function moveToCurrentLocation() {
  if ('geolocation' in navigator) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const { latitude, longitude } = position.coords;

      // 地図を現在位置に移動
      map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM);

      // 現在位置にマーカーを追加
      L.marker([latitude, longitude]).addTo(map)
        .bindPopup('現在位置')
        .openPopup();
    } catch (error) {
      alert('位置情報を取得できませんでした: ' + error.message);
    }
  } else {
    alert('このブラウザではGPSがサポートされていません');
  }
}

async function moveToLocation(lat, lng) {
  map.setView([lat, lng]);
}

const hexagonMap = new HexagonMap(map, CONFIG);

map.on('moveend', () => { hexagonMap.drawHexagons(); });
map.on('zoomend', updateZoomLevel);
map.on('click', (e) => {
  const { lat, lng } = e.latlng;
  hexagonMap.handleMapClick(lat, lng);
});

// document.querySelectorAll('input[name="mode"]').forEach(radio => {
//   radio.addEventListener('change', (event) => {
//     const selectedMode = event.target.value;
//     hexagonMap.setMode(selectedMode);
//   });
// });

// document.querySelectorAll('.resolution-checkbox').forEach(checkbox => {
//   checkbox.addEventListener('change', () => {
//     const selectedResolutions = Array.from(document.querySelectorAll('.resolution-checkbox:checked'))
//       .map(input => parseInt(input.value, 10));
//     hexagonMap.setResolutions(selectedResolutions);
//   });
// });

// document.getElementById('show-fill-color-checkbox').addEventListener('change', (event) => {
//   hexagonMap.toggleFillColorDisplay(event.target.checked);
// });

// document.getElementById("show-index-checkbox").addEventListener("change", (event) => {
//   hexagonMap.toggleIndexDisplay(event.target.checked);
// });

// document.getElementById("show-coordinates-checkbox").addEventListener("change", (event) => {
//   hexagonMap.toggleCoordinatesDisplay(event.target.checked);
// });

document.getElementById('max-cells-slider').addEventListener('input', (event) => {
  const maxCells = parseInt(event.target.value, 10);
  document.getElementById('max-cells-value').textContent = maxCells;
  hexagonMap.setMaxCells(maxCells);
});

document.getElementById('locate-sjk-btn').addEventListener('click', () => { moveToLocation(hexagonMap.config.DEFAULT_LAT, hexagonMap.config.DEFAULT_LNG); });
document.getElementById('locate-current-btn').addEventListener('click', () => { moveToCurrentLocation(); });

document.getElementById('reset-btn').addEventListener('click', () => { hexagonMap.resetCellsAndMarkers(); });

document.getElementById('search-form').addEventListener('submit', async (e) => {
  e.preventDefault(); // フォーム送信によるページリロードを防ぐ

  const query = document.getElementById('search-input').value;
  if (!query) {
    alert('検索ワードを入力してください。');
    return;
  }

  try {
    // Nominatim API を利用したジオコーディング
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const results = await response.json();
    if (results.length === 0) {
      alert('該当する地点が見つかりませんでした。');
      return;
    }
    // 最初の検索結果を利用（複数候補がある場合は、リスト表示や選択肢を設けるなどの工夫も可能）
    const result = results[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // 地図の中心を検索結果の位置に設定
    map.setView([lat, lon], CONFIG.DEFAULT_ZOOM);

    // 移動先にマーカーを追加（必要に応じて）
    L.marker([lat, lon])
      .addTo(map)
      .bindPopup(`${result.display_name}`)
      .openPopup();
  } catch (error) {
    console.error('検索中にエラーが発生しました:', error);
    alert('検索中にエラーが発生しました。');
  }
});

const controlsContainer = document.getElementById('controls-container');
const toggleBtn = document.getElementById('toggle-controls-btn');

toggleBtn.addEventListener('click', () => {
  const isHidden = controlsContainer.classList.toggle('hidden');
  toggleBtn.textContent = isHidden ? '▼' : '▲';
});

// === API
class Api {
  constructor() {
    // this.url = 'http://localhost:3000/api';
    this.url = "https://us-central1-firebase-functions-api-343106.cloudfunctions.net/circle_proxy";
  }

  async getCells(cell_ids) {
    const data = { cell_id: cell_ids };
    if (cell_ids.length === 0) {
      return [];
    }

    try {
      const response = await fetch(
        this.url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      // console.log('API のレスポンス:', result);
      return result;
    } catch (error) {
      // console.error('エラーが発生しました:', error);
      return [];
      //throw error;
    }
  }
}

// === main routine
updateZoomLevel();
hexagonMap.drawHexagons();
