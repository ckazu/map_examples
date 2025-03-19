let XYZToFaceUV = function (xyz) {
  let largestAbsComponent = function (xyz) {
    let temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];

    if (temp[0] > temp[1]) {
      if (temp[0] > temp[2]) {
        return 0;
      } else {
        return 2;
      }
    } else {
      if (temp[1] > temp[2]) {
        return 1;
      } else {
        return 2;
      }
    }

  };
  let faceXYZToUV = function (face, xyz) {
    switch (face) {
      case 0:
        return [
          xyz[1] / xyz[0],
          xyz[2] / xyz[0],
        ];
      case 1:
        return [
          -xyz[0] / xyz[1],
          xyz[2] / xyz[1],
        ];
      case 2:
        return [
          -xyz[0] / xyz[2],
          -xyz[1] / xyz[2],
        ];
      case 3:
        return [
          xyz[2] / xyz[0],
          xyz[1] / xyz[0],
        ];
      case 4:
        return [
          xyz[2] / xyz[1],
          -xyz[0] / xyz[1],
        ];
      case 5:
        return [
          -xyz[1] / xyz[2],
          -xyz[0] / xyz[2],
        ];
      default:
        throw Error(`Invalid face`);
    }
  };

  let face = largestAbsComponent(xyz);

  if (xyz[face] < 0) {
    face += 3;
  }

  let uv = faceXYZToUV(face, xyz);

  return [face, uv];
};
let FaceUVToXYZ = function (face, uv) {
  let u = uv[0];
  let v = uv[1];

  switch (face) {
    case 0:
      return [1, u, v];
    case 1:
      return [-u, 1, v];
    case 2:
      return [-u, -v, 1];
    case 3:
      return [-1, -v, -u];
    case 4:
      return [v, -1, -u];
    case 5:
      return [v, u, -1];
    default:
      throw Error(`Invalid face`);
  }
};

let STToUV = function (st) {
  let singleSTtoUV = function (st) {
    if (st >= 0.5) {
      return (1 / 3.0) * (4 * st * st - 1);
    } else {
      return (1 / 3.0) * (1 - (4 * (1 - st) * (1 - st)));
    }
  };
  return [
    singleSTtoUV(st[0]),
    singleSTtoUV(st[1]),
  ];
};
let UVToST = function (uv) {
  let singleUVtoST = function (uv) {
    if (uv >= 0) {
      return 0.5 * Math.sqrt(1 + 3 * uv);
    } else {
      return 1 - 0.5 * Math.sqrt(1 - 3 * uv);
    }
  };
  return [
    singleUVtoST(uv[0]),
    singleUVtoST(uv[1])
  ];
};

let STToIJ = function (st, order) {
  let maxSize = (1 << order);

  let singleSTtoIJ = function (st) {
    let ij = Math.floor(st * maxSize);
    return Math.max(0, Math.min(maxSize - 1, ij));
  };

  return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
};
let IJToST = function (ij, order, offsets) {
  let maxSize = (1 << order);

  return [
    (ij[0] + offsets[0]) / maxSize,
    (ij[1] + offsets[1]) / maxSize
  ];
};

let S2LatLng = class {
  constructor() {
    this.lat = 0;
    this.lng = 0;
  }
  static from(latitude, longitude, wrap = true) {
    if (wrap) {
      latitude = Math.max(Math.min(latitude, 90), -90); // clamp latitude into -90..90
      longitude = (longitude + 180) % 360 + ((longitude < -180 || longitude == 180) ? 180 : -180); // wrap longtitude into -180..180
    }

    let self = new this;
    self.lat = latitude;
    self.lng = longitude;
    return self;
  }
  static fromInteger(id) {
    return S2Cell.fromInteger(id).toLatLng();
  }
  static _fromXYZ(xyz) {
    let RAD_TO_DEG = 180 / Math.PI;
    let lat = Math.atan2(xyz[2], Math.sqrt(xyz[0] * xyz[0] + xyz[1] * xyz[1]));
    let lng = Math.atan2(xyz[1], xyz[0]);
    return this.from(lat * RAD_TO_DEG, lng * RAD_TO_DEG);
  }

  _toXYZ() {
    /* http://stackoverflow.com/questions/8981943/lat-long-to-x-y-z-position-in-js-not-working */
    let DEG_TO_RAD = Math.PI / 180;
    let phi = this.lat * DEG_TO_RAD;
    let theta = this.lng * DEG_TO_RAD;
    let cosphi = Math.cos(phi);
    return [
      Math.cos(theta) * cosphi,
      Math.sin(theta) * cosphi,
      Math.sin(phi),
    ];
  }
  toInteger(level) {
    return S2Cell.fromLatLng(this, level).toInteger();
  }

  getNeighbors(level) {
    return S2Cell.fromLatLng(this, level).getNeighbors();
  }

  compareTo(other) {
    return this.toInteger() - other.toInteger();
  }
};

let S2Point = class {
  constructor() {
    this.x = 0;
    this.y = 0;
  }
  flip() {
    let x = this.x;
    this.x = this.y
    this.y = x;
  }
};
let MAX_LEVEL = 30;
let S2Cell = class {
  constructor() {
    this.face = 0;
    this.ij = [0, 0];
    this.level = MAX_LEVEL;
  }
  static from(face, ij, level = MAX_LEVEL) {
    level = Math.min(Math.max(level, 1), MAX_LEVEL);

    let self = new this;
    self.face = face;
    self.ij = ij;
    self.level = level;
    return self;
  }
  static fromLatLng(latLng, level = MAX_LEVEL) {
    let xyz = latLng._toXYZ();
    let faceuv = XYZToFaceUV(xyz);
    let st = UVToST(faceuv[1]);
    let ij = STToIJ(st, level);
    return this.from(faceuv[0], ij, level);
  }
  static fromInteger(cellId) {
    cellId = BigInt(cellId);
    let rotateAndFlipQuadrant = function (n, point, rx, ry) {
      if (ry == 0) {
        if (rx == 1) {
          point.x = n - 1 - point.x;
          point.y = n - 1 - point.y;

        }
        point.flip();
      }
    }
    let face = cellId >> 61n;
    let positions = BigInt.asUintN(61, cellId);
    let maxLevel = MAX_LEVEL;
    let point = new S2Point;
    while ((positions & 1n) == 0n) {
      positions >>= 2n; // remove zero padding
      maxLevel -= 1;
    }
    positions >>= 1n; // remove 1-bit lsb marker
    for (let level = 0; level < maxLevel; level += 1) {
      let position = positions & 3n;
      let rx = 0;
      let ry = 0;
      if (position == 1n) {
        ry = 1;
      } else if (position == 2n) {
        rx = 1;
        ry = 1;
      } else if (position == 3n) {
        rx = 1;
      }
      let value = Math.pow(2, level);
      rotateAndFlipQuadrant(value, point, rx, ry);
      point.x += value * rx;
      point.y += value * ry;
      positions >>= 2n;
    }
    if (face % 2n == 1) {
      point.flip();
    }
    return this.from(Number(face), [point.x, point.y], maxLevel);
  }

  toLatLng() {
    let st = IJToST(this.ij, this.level, [0.5, 0.5]);
    let uv = STToUV(st);
    let xyz = FaceUVToXYZ(this.face, uv);
    return S2LatLng._fromXYZ(xyz);
  }
  *getCornerLatLngs() {
    let offsets = [
      [0.0, 0.0],
      [0.0, 1.0],
      [1.0, 1.0],
      [1.0, 0.0]
    ];
    for (let offset of offsets) {
      let st = IJToST(this.ij, this.level, offset);
      let uv = STToUV(st);
      let xyz = FaceUVToXYZ(this.face, uv);
      yield S2LatLng._fromXYZ(xyz);
    }
  }

  /* hilbert space-filling curve based on http://blog.notdot.net/2009/11/Damn-Cool-Algorithms-Spatial-indexing-with-Quadtrees-and-Hilbert-Curves */
  static _pointToHilbertQuadList(point, order = MAX_LEVEL, face = 0) {
    let hilbertMap = {
      a: [[0n, `d`], [1n, `a`], [3n, `b`], [2n, `a`]],
      b: [[2n, `b`], [1n, `b`], [3n, `a`], [0n, `c`]],
      c: [[2n, `c`], [3n, `d`], [1n, `c`], [0n, `b`]],
      d: [[0n, `a`], [3n, `c`], [1n, `d`], [2n, `d`]],
    };
    let currentSquare = (face % 2) ? `d` : `a`;
    let positions = 0n;
    let shift = 64n;
    let [x, y] = point;
    for (let index = order - 1; index >= 0; index -= 1) {
      let mask = 1 << index;
      let quadX = x & mask ? 1 : 0;
      let quadY = y & mask ? 1 : 0;
      let [position, nextSquare] = hilbertMap[currentSquare][quadX * 2 + quadY];
      currentSquare = nextSquare;
      shift -= 2n;
      positions |= position << shift;
    }
    return positions;
  }
  toInteger(_step = 0) {
    let quads = S2Cell._pointToHilbertQuadList(this.ij, this.level, this.face);
    if (_step) {
      let shift = BigInt(64 - this.level * 2);
      quads = ((quads >> shift) + BigInt(_step)) << shift;
    }
    return (BigInt(this.face) << 61n) | (quads >> 3n) | (1n << BigInt(60 - this.level * 2));
  }

  *getNeighbors() {
    let fromFaceIJWrap = function (face, ij, level) {
      let maxSize = 1 << level;
      if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < maxSize && ij[1] < maxSize) {
        return S2Cell.from(face, ij, level);
      } else {
        let st = IJToST(ij, level, [0.5, 0.5]);
        let uv = STToUV(st);
        let xyz = FaceUVToXYZ(face, uv);
        let faceuv = XYZToFaceUV(xyz);
        face = faceuv[0];
        uv = faceuv[1];
        st = UVToST(uv);
        ij = STToIJ(st, level);
        return S2Cell.from(face, ij, level);
      }
    };

    // 修正箇所：thisから直接face, ij, levelを取り出す
    let { face, ij: [i, j], level } = this;

    yield fromFaceIJWrap(face, [i - 1, j], level); // left
    yield fromFaceIJWrap(face, [i, j - 1], level); // down
    yield fromFaceIJWrap(face, [i + 1, j], level); // right
    yield fromFaceIJWrap(face, [i, j + 1], level); // up
  }

  move(step) {
    return S2Cell.fromInteger(this.toInteger(step));
  }

  includes(other) {
    if (other instanceof S2LatLng) {
      other = S2Cell.fromLatLng(other);
    }
    let shift = BigInt(61 - this.level * 2);
    return (this.toInteger() >> shift) == (other.toInteger() >> shift);
  }

  compareTo(other) {
    return this.toInteger() - other.toInteger();
  }
};