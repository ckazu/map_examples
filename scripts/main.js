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
  constructor(map, config) {
    this.map = map;
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
    this.currentCells.forEach(polygon => polygon.closeTooltip());

    (async () => {
      try {
        await this.drawS2Cells();
      } catch (error) {
        console.error("描画中にエラーが発生しました:", error);
      } finally {
        this.isDrawing = false;
      }
    })();
  }

  async drawS2Cells() {
    const api = new Api();
    const center = this.map.getCenter();
    const latLng = S2LatLng.from(center.lat, center.lng);
    const cell = S2Cell.fromLatLng(latLng, this.resolution);
    const cells = this.getS2Neighbors(cell, this.maxCells);
    const cellIds = cells.map(c => c.toInteger().toString());

    // APIリクエスト：まだ描画されていないセルIDのみ対象
    const fetchCellIds = cellIds.filter(id =>
      !this.currentCells.some(polygon => polygon.options.cellId === id)
    );
    const cellsStats = await api.getCells(fetchCellIds);

    cells.forEach(currentCell => {
      const cellId = currentCell.toInteger().toString();
      if (this.currentCells.find(polygon => polygon.options.cellId === cellId)) return;

      const cellStats = cellsStats.find(stat => stat.cell_id === cellId);
      let fillColor = 'transparent';
      if (cellStats) {
        fillColor = this.config.COLORS[cellStats.level] || fillColor;
        if (cellStats.level === 0 && cellStats.score <= 0) {
          fillColor = 'gray';
        }
      }

      // セルの境界を若干縮小して重なりを防止
      const corners = Array.from(currentCell.getCornerLatLngs());
      const scaledCorners = this.scaleBoundary(
        corners.map(corner => [corner.lng, corner.lat]),
        0.99
      );
      const polygonLatLngs = scaledCorners.map(([lng, lat]) => [lat, lng]);
      this.addPolygon(cellId, polygonLatLngs, fillColor, cellStats);
    });

    console.log("現在のセル数:", this.currentCells.length);
  }

  getS2Neighbors(cell, maxCells) {
    const neighbors = [cell];
    const visited = new Set([cell.toInteger()]);
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
        if (neighbors.length >= maxCells) break;
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
      ([sumLng, sumLat], [lng, lat]) => [sumLng + lng, sumLat + lat],
      [0, 0]
    );
    return [sum[0] / total, sum[1] / total];
  }

  addPolygon(cellId, latlngs, color, stats) {
    const polygon = L.polygon(latlngs, {
      cellId: cellId,
      stats: stats,
      color: "gray",
      opacity: 0.5,
      fillColor: color,
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
      const marker = L.marker(center, { icon: statsIcon, interactive: false }).addTo(this.map);
      polygon.statsMarker = marker;

      polygon.on('mouseover', e => {
        const tooltipContent = typeof stats === 'object' ? JSON.stringify(stats, null, 2) : stats;
        polygon.bindTooltip(`<pre>${tooltipContent}</pre>`, {
          permanent: false,
          direction: 'top',
          className: 'stats-tooltip'
        }).openTooltip(e.latlng);
      });

      polygon.on('mouseout', () => polygon.closeTooltip());
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
    const zoomLevelElement = document.getElementById('zoom-level');
    if (zoomLevelElement) {
      zoomLevelElement.textContent = zoomLevel;
    }
  }

  async moveToCurrentLocation() {
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject)
        );
        const { latitude, longitude } = position.coords;
        this.map.setView([latitude, longitude], CONFIG.DEFAULT_ZOOM);
        L.marker([latitude, longitude])
          .addTo(this.map)
          .bindPopup('現在位置')
          .openPopup();
      } catch (error) {
        alert('位置情報を取得できませんでした: ' + error.message);
      }
    } else {
      alert('このブラウザではGPSがサポートされていません');
    }
  }

  moveToLocation(lat, lng) {
    this.map.setView([lat, lng]);
  }
}

class Api {
  constructor() {
    this.url = CONFIG.PROXY_URL;
  }

  async getCells(cellIds) {
    if (cellIds.length === 0) return [];
    const data = { cell_id: cellIds };

    try {
      console.log(`API request: 新規セル ${cellIds.length} 件の取得`);
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      return [];
    }
  }
}

class UiController {
  constructor(baseMap, cellMap) {
    this.baseMap = baseMap;
    this.cellMap = cellMap;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    const mapInstance = this.baseMap.map;
    mapInstance.on('moveend', () => this.cellMap.drawCells());
    mapInstance.on('zoomend', () => this.baseMap.updateZoomLevel());

    const toggleBtn = document.getElementById('toggle-controls-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const controlsContainer = document.getElementById('controls-container');
        if (controlsContainer) {
          const isHidden = controlsContainer.classList.toggle('hidden');
          toggleBtn.textContent = isHidden ? '▼' : '▲';
        }
      });
    }

    const locateSjkBtn = document.getElementById('locate-sjk-btn');
    if (locateSjkBtn) {
      locateSjkBtn.addEventListener('click', () => {
        this.baseMap.moveToLocation(this.cellMap.config.DEFAULT_LAT, this.cellMap.config.DEFAULT_LNG);
      });
    }

    const locateCurrentBtn = document.getElementById('locate-current-btn');
    if (locateCurrentBtn) {
      locateCurrentBtn.addEventListener('click', () => {
        this.baseMap.moveToCurrentLocation();
      });
    }

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.cellMap.resetCellsAndMarkers();
      });
    }

    const maxCellsSlider = document.getElementById('max-cells-slider');
    if (maxCellsSlider) {
      maxCellsSlider.addEventListener('input', event => {
        const newMaxCells = parseInt(event.target.value, 10);
        const maxCellsValue = document.getElementById('max-cells-value');
        if (maxCellsValue) {
          maxCellsValue.textContent = newMaxCells;
        }
        this.cellMap.maxCells = newMaxCells;
        this.cellMap.drawCells();
      });
    }

    const searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', async e => {
        e.preventDefault();
        const queryInput = document.getElementById('search-input');
        const query = queryInput ? queryInput.value : '';
        if (!query) {
          alert('検索ワードを入力してください。');
          return;
        }

        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const results = await response.json();
          if (!results.length) {
            alert('該当する地点が見つかりませんでした。');
            return;
          }
          const result = results[0];
          const lat = parseFloat(result.lat);
          const lng = parseFloat(result.lon);
          this.baseMap.moveToLocation(lat, lng);
          L.marker([lat, lng])
            .addTo(this.baseMap.map)
            .bindPopup(result.display_name)
            .openPopup();
        } catch (error) {
          console.error('検索中にエラーが発生しました:', error);
          alert('検索中にエラーが発生しました。');
        }
      });
    }
  }
}

// main routine
document.addEventListener('DOMContentLoaded', () => {
  const baseMap = new BaseMap(CONFIG);
  const cellMap = new CellMap(baseMap.map, CONFIG);
  new UiController(baseMap, cellMap);

  baseMap.updateZoomLevel();
  cellMap.drawCells();
});
