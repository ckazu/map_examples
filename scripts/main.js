const CONFIG = {
  DEFAULT_LAT: 35.6868653, // 35.68963,
  DEFAULT_LNG: 139.7011946, //139.69165,
  DEFAULT_ZOOM: 19,
  MIN_ZOOM: 1,
  MAX_ZOOM: 22,
  DEFAULT_RESOLUTION: 17,
  MAX_CELLS: 100,
  COLORS: ['khaki', 'cyan', 'blue', 'pink'],
  // TILE_LAYER: {url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', copyright: "© OpenStreetMap contributors"},
  TILE_LAYER: { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', copyright: "© OpenStreetMap contributors" },
  PROXY_URL: "https://us-central1-firebase-functions-api-343106.cloudfunctions.net/circle_proxy"
};

class CellMap {
  constructor(base_map, config) {
    this.map = base_map.map;
    this.config = config;
    this.resolution = config.DEFAULT_RESOLUTION;
    this.maxCells = config.MAX_CELLS;
    this.currentCells = [];
    this.isDrawing = false;
  }

  resetCellsAndMarkers() {
    this.currentCells.forEach(layer => {
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
    this.currentCells = [];
  }

  drawCells() {
    if (this.isDrawing) {
      console.log("描画処理中のため、新たな描画処理は実行されません。");
      return;
    }
    this.isDrawing = true;

    this.currentCells.forEach(polygon => {
      polygon.closeTooltip();
    });

    const drawProcess = async () => {
      try {
        await this.drawS2Cells();
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

    const latLng = S2LatLng.from(centerLat, centerLng);
    const cell = S2Cell.fromLatLng(latLng, this.resolution);
    const cells = this.getS2Neighbors(cell, this.maxCells);
    const cell_ids = cells.map(cell => cell.toInteger().toString());

    // API request
    const fetch_cell_ids = cell_ids.filter(cell_id => {
      return !this.currentCells.some(polygon => polygon.options.cell_id === cell_id);
    });
    const cells_stats = await api.getCells(fetch_cell_ids);

    // draw cells
    for (const currentCell of cells) {
      const cell_id = currentCell.toInteger().toString();
      if (this.currentCells.find(polygon => polygon.options.cell_id === cell_id)) {
        continue;
      }

      const cell_stats = cells_stats.find(cell => cell.cell_id === cell_id);
      let fillColor = 'transparent';
      if (cell_stats) {
        fillColor = this.config.COLORS[cell_stats.level];
        if (cell_stats.level === 0 && cell_stats.score <= 0) {
          fillColor = 'gray';
        }
      }

      // ちょっとだけセルを小さくする
      const corners = Array.from(currentCell.getCornerLatLngs());
      const scaledCorners = this.scaleBoundary(
        corners.map(corner => [corner.lng, corner.lat]),
        0.99
      );
      // セルの描画
      const polygon = scaledCorners.map(([lng, lat]) => [lat, lng]);
      this.addPolygon(cell_id, polygon, fillColor, cell_stats);
    }
    console.log("current cells:", this.currentCells.length);
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
    const polygon = L.polygon(latlngs, {
      cell_id: cell_id,
      stats: stats,
      color: "gray",
      opacity: 0.5,
      fillColor: fillColor,
      fillOpacity: 0.4,
      weight: 1.5,
    }).addTo(this.map);

    this.currentCells.push(polygon);

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
}

class BaseMap {
  constructor(config) {
    this.map = L.map('map', {
      minZoom: config.MIN_ZOOM,
      maxZoom: config.MAX_ZOOM,
    }).setView([config.DEFAULT_LAT, config.DEFAULT_LNG], config.DEFAULT_ZOOM);

    L.tileLayer(config.TILE_LAYER.url, {
      maxZoom: config.MAX_ZOOM,
      attribution: config.TILE_LAYER.copyright,
    }).addTo(this.map);
  }

  updateZoomLevel() {
    const zoomLevel = this.map.getZoom();
    document.getElementById('zoom-level').textContent = zoomLevel;
  }

  setMaxCells(newMaxCells) {
    cellMap.maxCells = newMaxCells;
    cellMap.drawCells();
  }

  async moveToCurrentLocation() {
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const { latitude, longitude } = position.coords;

        // 地図を現在位置に移動
        this.map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM);

        // 現在位置にマーカーを追加
        L.marker([latitude, longitude]).addTo(this.map)
          .bindPopup('現在位置')
          .openPopup();
      } catch (error) {
        alert('位置情報を取得できませんでした: ' + error.message);
      }
    } else {
      alert('このブラウザではGPSがサポートされていません');
    }
  }

  async moveToLocation(lat, lng) {
    this.map.setView([lat, lng]);
  }
}

// === API
class Api {
  constructor() {
    this.url = CONFIG.PROXY_URL;
  }

  async getCells(cell_ids) {
    const data = { cell_id: cell_ids };
    if (cell_ids.length === 0) {
      return [];
    }

    try {
      console.log("API request. fetch new cell length:", cell_ids.length);
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
      return result;
    } catch (error) {
      return [];
    }
  }
}

class UiController {
  constructor(baseMap, cellMap) {
    this.addEventListeners(baseMap, cellMap);
  }

  addEventListeners(baseMap, cellMap) {
    baseMap.map.on('moveend', () => { cellMap.drawCells(); });
    baseMap.map.on('zoomend', () => { baseMap.updateZoomLevel() });

    const toggleBtn = document.getElementById('toggle-controls-btn');
    toggleBtn.addEventListener('click', () => {
      const controlsContainer = document.getElementById('controls-container');
      const isHidden = controlsContainer.classList.toggle('hidden');
      toggleBtn.textContent = isHidden ? '▼' : '▲';
    });

    document.getElementById('locate-sjk-btn').addEventListener('click', () => {
      baseMap.moveToLocation(cellMap.config.DEFAULT_LAT, cellMap.config.DEFAULT_LNG);
    });
    document.getElementById('locate-current-btn').addEventListener('click', () => {
      baseMap.moveToCurrentLocation();
    });
    document.getElementById('reset-btn').addEventListener('click', () => {
      cellMap.resetCellsAndMarkers();
    });
    document.getElementById('max-cells-slider').addEventListener('input', (event) => {
      const maxCells = parseInt(event.target.value, 10);
      document.getElementById('max-cells-value').textContent = maxCells;
      baseMap.setMaxCells(maxCells);
    });
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
        const map = baseMap.map;
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
  }
}

// === main routine
const baseMap = new BaseMap(CONFIG);
const cellMap = new CellMap(baseMap, CONFIG);
const uiController = new UiController(baseMap, cellMap);

// 起動時に取得する
baseMap.updateZoomLevel();
cellMap.drawCells();
