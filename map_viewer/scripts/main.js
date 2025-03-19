const CONFIG = {
  DEFAULT_LAT: 35.6868653, // 35.68963,
  DEFAULT_LNG: 139.7011946, //139.69165,
  DEFAULT_ZOOM: 19,
  MIN_ZOOM: 1,
  MAX_ZOOM: 22,
  DEFAULT_RESOLUTION: 17,
  MAX_CELLS: 100,
  COLORS: ['khaki', 'cyan', 'blue', 'pink', 'red'],
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
    const cellCache = new CellCache();

    const center = this.map.getCenter();
    const latLng = S2LatLng.from(center.lat, center.lng);
    const centerCell = S2Cell.fromLatLng(latLng, this.resolution);
    const cells = this.getS2Neighbors(centerCell, this.maxCells);

    // キャッシュチェック
    const missingCellIds = [];
    const validCellsData = [];
    cells.forEach(cell => {
      const cellId = cell.toInteger().toString();
      const cached = cellCache.getCell(cellId) || this.currentCells.find(polygon => polygon.options.cellId === cellId)?.options;
      if (cached) {
        validCellsData.push(cached);
      } else {
        missingCellIds.push(cellId);
      }
    });

    let fetchedCells = [];
    if (missingCellIds.length > 0) {
      fetchedCells = await api.getCells(missingCellIds);

      fetchedCells.forEach(cellData => {
        cellCache.setCell(cellData.cell_id, cellData);
      });
    }

    cells.forEach(cell => {
      const cellId = cell.toInteger().toString();
      const cachedCellData = cellCache.getCell(cellId);
      let cellData;
      if (cachedCellData) {
        cellData = cachedCellData;
      } else {
        const fetchedCellData = fetchedCells.find(cellData => cellId === cellData.cell_id);
        if (fetchedCellData) {
          cellData = fetchedCellData;
        }
      }
      if (this.currentCells.find(polygon => polygon.options.cellId === cellData?.cell_id)) return;

      let fillColor = 'transparent';
      if (cellData) {
        fillColor = this.config.COLORS[cellData.level] || fillColor;
        if (cellData.level === 0 && cellData.score <= 0) {
          fillColor = 'gray';
        }
      }

      const corners = Array.from(cell.getCornerLatLngs());
      const scaledCorners = this.scaleBoundary(
        corners.map(corner => [corner.lng, corner.lat]),
        0.99
      );
      const polygonLatLngs = scaledCorners.map(([lng, lat]) => [lat, lng]);

      this.addPolygon(cellId, polygonLatLngs, fillColor, cellData);
    });
    this.updateCellStats();
    console.log("現在のセル数:", this.currentCells.length);
  }

  updateCellStats() {
    const zoomLevel = this.map.getZoom();

    if (zoomLevel <= 16) {
      for (const polygon of this.currentCells) {
        if (polygon.statsMarker) {
          this.map.removeLayer(polygon.statsMarker);
          polygon.statsMarker = null;
        }
      }
      return;
    }

    for (const polygon of this.currentCells) {
      const stats = polygon.options.stats;
      if (!stats || polygon.statsMarker) continue;

      const center = polygon.getBounds().getCenter();
      polygon.statsMarker = L.marker(
        [center.lat, center.lng], {
        icon: L.divIcon({
          className: 'stats-marker',
          html: `level ${stats.level}<br/>score ${stats.score}`,
          iconSize: [100, 50],
          iconAnchor: [20, 10]
        },),
        interactive: false,
      }).addTo(this.map);
    }
  }

  getS2Neighbors(centerCell, maxCells) {
    // BFS で候補セルを幅広く収集（余裕をもって maxCells の 3 倍程度集める）
    const visited = new Set();
    const candidates = [];
    const queue = [centerCell];
    visited.add(centerCell.toInteger());

    while (queue.length > 0 && candidates.length < maxCells * 3) {
      const current = queue.shift();
      candidates.push(current);

      for (const neighbor of current.getNeighbors()) {
        const neighborId = neighbor.toInteger();
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighbor);
        }
      }
    }

    const centerCoord = this.getCellCenter(centerCell);

    // 候補セルを中心からの距離でソート
    candidates.sort((a, b) => {
      const aCenter = this.getCellCenter(a);
      const bCenter = this.getCellCenter(b);
      return this.haversineDistance(centerCoord.lat, centerCoord.lng, aCenter.lat, aCenter.lng) -
        this.haversineDistance(centerCoord.lat, centerCoord.lng, bCenter.lat, bCenter.lng);
    });

    // 上位 maxCells 個を返す
    return candidates.slice(0, maxCells);
  }

  // -----------------------------------------
  // セルの中心座標を算出するヘルパー関数
  getCellCenter(cell) {
    // cell.getCornerLatLngs() は各頂点の LatLng オブジェクトの iterable と仮定
    // ここでは各頂点の [lng, lat] の配列に変換し、getPolygonCenter を利用
    const corners = Array.from(cell.getCornerLatLngs()).map(corner => [corner.lng, corner.lat]);
    const center = this.getPolygonCenter(corners);  // [lng, lat] の配列を返す
    return { lat: center[1], lng: center[0] };
  }

  // -----------------------------------------
  // Haversine 公式による2点間の距離計算（km 単位）
  haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球の半径 (km)
    const toRad = deg => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
    // すでに同じ cellId のポリゴンが存在する場合はスキップ
    if (this.currentCells.find(polygon => polygon.options.cellId === cellId)) return;
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

class CellCache {
  constructor(storageKey = 'cellCache', expirationTime = 3600000, saveDelay = 1000) { // expirationTime: 1時間, saveDelay: 1秒
    this.storageKey = storageKey;
    this.expirationTime = expirationTime;
    this.cache = new Map();
    this.loadCache();

    // 保存のデバウンス用タイマー
    this.saveDelay = saveDelay;
    this.saveTimeout = null;
  }

  loadCache() {
    const data = localStorage.getItem(this.storageKey);
    if (data) {
      try {
        console.log('load cache:', Object.keys(JSON.parse(data)).length);
        const parsed = JSON.parse(data);
        for (const key in parsed) {
          this.cache.set(key, parsed[key]);
        }
      } catch (e) {
        console.error('キャッシュの読み込みに失敗しました:', e);
      }
    }
  }

  scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveCache();
    }, this.saveDelay);
  }

  saveCache() {
    try {
      const obj = Object.fromEntries(this.cache);
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch (e) {
      console.error('キャッシュの保存に失敗しました:', e);
    }
  }

  // セルデータが有効かどうか判定
  isValid(cellData) {
    return (Date.now() - cellData.timestamp < this.expirationTime);
  }

  // 指定 cellId のセルデータを取得（存在し、有効なら返す）
  getCell(cellId) {
    const cellData = this.cache.get(cellId);
    if (cellData && this.isValid(cellData)) {
      return cellData;
    } else if (cellData) {
      // 有効期限切れの場合は削除
      this.cache.delete(cellId);
      this.saveCache();
    }
    return null;
  }

  // セルデータをキャッシュに保存（タイムスタンプをセット）
  setCell(cellId, cellData) {
    cellData.timestamp = Date.now();
    this.cache.set(cellId, cellData);
    this.saveCache();
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
        // cache もクリアする
        const cellCache = new CellCache();
        cellCache.cache.clear();
        cellCache.saveCache();
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
