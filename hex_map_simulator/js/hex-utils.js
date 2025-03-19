/**
 * Hex Map Simulator - Hex Utilities
 *
 * Provides utility functions for hex grid operations using cube coordinates.
 * Cube coordinates use x, y, z system where x + y + z = 0
 */

class HexUtils {
    /**
     * Create a cube coordinate
     * @param {number} x - x coordinate
     * @param {number} y - y coordinate
     * @param {number} z - z coordinate
     * @returns {Object} Cube coordinate
     */
    static createHex(x, y, z) {
        if (Math.round(x + y + z) !== 0) {
            throw new Error('Cube coordinates must sum to 0');
        }
        return { x, y, z };
    }

    /**
     * Create a cube coordinate from axial coordinates (q, r)
     * @param {number} q - q coordinate (column)
     * @param {number} r - r coordinate (row)
     * @returns {Object} Cube coordinate
     */
    static axialToCube(q, r) {
        const x = q;
        const z = r;
        const y = -x - z;
        return { x, y, z };
    }

    /**
     * Convert cube coordinates to axial coordinates
     * @param {Object} hex - Cube coordinate
     * @returns {Object} Axial coordinate (q, r)
     */
    static cubeToAxial(hex) {
        return { q: hex.x, r: hex.z };
    }

    /**
     * Add two hex coordinates
     * @param {Object} a - First hex
     * @param {Object} b - Second hex
     * @returns {Object} Resulting hex
     */
    static add(a, b) {
        return {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z
        };
    }

    /**
     * Subtract hex b from hex a
     * @param {Object} a - First hex
     * @param {Object} b - Second hex
     * @returns {Object} Resulting hex
     */
    static subtract(a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z
        };
    }

    /**
     * Calculate distance between two hexes
     * @param {Object} a - First hex
     * @param {Object} b - Second hex
     * @returns {number} Distance in hex units
     */
    static distance(a, b) {
        const vec = this.subtract(a, b);
        return Math.max(Math.abs(vec.x), Math.abs(vec.y), Math.abs(vec.z));
    }

    /**
     * Get a specific neighbor of a hex
     * @param {Object} hex - The hex
     * @param {number} direction - Direction (0 to 5)
     * @returns {Object} Neighbor hex
     */
    static neighbor(hex, direction) {
        const directions = [
            { x: 1, y: -1, z: 0 },  // 0: east
            { x: 0, y: -1, z: 1 },  // 1: northeast
            { x: -1, y: 0, z: 1 },  // 2: northwest
            { x: -1, y: 1, z: 0 },  // 3: west
            { x: 0, y: 1, z: -1 },  // 4: southwest
            { x: 1, y: 0, z: -1 }   // 5: southeast
        ];
        return this.add(hex, directions[direction]);
    }

    /**
     * Get all neighbors of a hex
     * @param {Object} hex - The hex
     * @returns {Array} Array of neighbor hexes
     */
    static neighbors(hex) {
        const result = [];
        for (let i = 0; i < 6; i++) {
            result.push(this.neighbor(hex, i));
        }
        return result;
    }

    /**
     * Get hex coordinates along a line between two hexes
     * @param {Object} a - Start hex
     * @param {Object} b - End hex
     * @returns {Array} Array of hexes along the line
     */
    static line(a, b) {
        const distance = this.distance(a, b);
        if (distance === 0) {
            return [a];
        }

        const results = [];
        for (let i = 0; i <= distance; i++) {
            const t = i / distance;

            // Linear interpolation between the two points
            const x = Math.round(a.x * (1 - t) + b.x * t);
            const y = Math.round(a.y * (1 - t) + b.y * t);
            const z = Math.round(a.z * (1 - t) + b.z * t);

            // Ensure coordinates sum to 0 (fix potential rounding errors)
            const hex = this.cubeRound({ x, y, z });
            results.push(hex);
        }
        return results;
    }

    /**
     * Get all hexes along a line and those that intersect with the line
     * @param {Object} a - Start hex
     * @param {Object} b - End hex
     * @param {Object} layout - Layout parameters (for conversion)
     * @returns {Array} Array of hexes along or intersecting the line
     */
    static lineHexes(a, b, layout) {
        // Get hexes directly on the line
        const directLineHexes = this.line(a, b);
        const lineHexSet = new Set(directLineHexes.map(hex => this.hashHex(hex)));

        // Convert to screen coordinates for line intersection tests
        const aScreen = this.hexToScreen(a, layout);
        const bScreen = this.hexToScreen(b, layout);

        // Create a slightly larger bounding box around the line to check for intersections
        const margin = 2; // Margin in hex coordinates
        const minX = Math.min(a.x, b.x) - margin;
        const maxX = Math.max(a.x, b.x) + margin;
        const minY = Math.min(a.y, b.y) - margin;
        const maxY = Math.max(a.y, b.y) + margin;
        const minZ = Math.min(a.z, b.z) - margin;
        const maxZ = Math.max(a.z, b.z) + margin;

        const results = [...directLineHexes]; // Start with hexes directly on the line

        // Check all hexes in the bounding box that aren't already in the direct line
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                // z is constrained by x + y + z = 0
                const z = -x - y;

                // Only check hexes within the valid bounds
                if (z >= minZ && z <= maxZ) {
                    const hex = { x, y, z };
                    const hexHash = this.hashHex(hex);

                    // Skip hexes already in the direct line
                    if (lineHexSet.has(hexHash)) continue;

                    // Check if this hex intersects with the line
                    const hexCenter = this.hexToScreen(hex, layout);
                    const hexCorners = this.hexCorners(hexCenter, layout.size);

                    // Check if any hex edge intersects with the line
                    let intersects = false;
                    for (let i = 0; i < 6; i++) {
                        const j = (i + 1) % 6;
                        if (this.lineSegmentsIntersect(
                            hexCorners[i], hexCorners[j], aScreen, bScreen)) {
                            intersects = true;
                            break;
                        }
                    }

                    if (intersects) {
                        results.push(hex);
                    }
                }
            }
        }

        return results;
    }

    /**
     * Check if three points are collinear (form a straight line)
     * @param {Object} a - First point
     * @param {Object} b - Second point
     * @param {Object} c - Third point
     * @returns {boolean} True if the points are collinear
     */
    static areCollinear(a, b, c) {
        // Convert to screen coordinates for a more accurate check
        const ax = a.x * 3 / 2;
        const ay = a.x * Math.sqrt(3) / 2 + a.z * Math.sqrt(3);

        const bx = b.x * 3 / 2;
        const by = b.x * Math.sqrt(3) / 2 + b.z * Math.sqrt(3);

        const cx = c.x * 3 / 2;
        const cy = c.x * Math.sqrt(3) / 2 + c.z * Math.sqrt(3);

        // Area of triangle is zero if points are collinear
        // Area = 1/2 * |x1(y2 - y3) + x2(y3 - y1) + x3(y1 - y2)|
        const area = Math.abs(ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2;

        // If area is close to zero, points are collinear
        return area < 0.0001;
    }

    /**
     * Round floating point cube coordinates to valid integer cube coordinates
     * @param {Object} cube - Cube coordinate with floating point values
     * @returns {Object} Rounded cube coordinate
     */
    static cubeRound(cube) {
        let rx = Math.round(cube.x);
        let ry = Math.round(cube.y);
        let rz = Math.round(cube.z);

        const xDiff = Math.abs(rx - cube.x);
        const yDiff = Math.abs(ry - cube.y);
        const zDiff = Math.abs(rz - cube.z);

        // Adjust the coordinate that changed the most to maintain x + y + z = 0
        if (xDiff > yDiff && xDiff > zDiff) {
            rx = -ry - rz;
        } else if (yDiff > zDiff) {
            ry = -rx - rz;
        } else {
            rz = -rx - ry;
        }

        return { x: rx, y: ry, z: rz };
    }

    /**
     * Check if a point is inside a triangle formed by three hexes
     * @param {Object} point - The hex to check
     * @param {Object} a - First corner of triangle
     * @param {Object} b - Second corner of triangle
     * @param {Object} c - Third corner of triangle
     * @returns {boolean} True if point is inside triangle
     */
    static pointInTriangle(point, a, b, c) {
        // Convert cube coordinates to 2D space for triangle containment test
        // Using the same conversion as hexToScreen but without the origin offset
        const ax = a.x * 3 / 2;
        const ay = a.x * Math.sqrt(3) / 2 + a.z * Math.sqrt(3);

        const bx = b.x * 3 / 2;
        const by = b.x * Math.sqrt(3) / 2 + b.z * Math.sqrt(3);

        const cx = c.x * 3 / 2;
        const cy = c.x * Math.sqrt(3) / 2 + c.z * Math.sqrt(3);

        const px = point.x * 3 / 2;
        const py = point.x * Math.sqrt(3) / 2 + point.z * Math.sqrt(3);

        // Compute barycentric coordinates
        const areaABC = Math.abs((ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
        const areaPBC = Math.abs((px * (by - cy) + bx * (cy - py) + cx * (py - by)) / 2);
        const areaPAC = Math.abs((ax * (py - cy) + px * (cy - ay) + cx * (ay - py)) / 2);
        const areaPAB = Math.abs((ax * (by - py) + bx * (py - ay) + px * (ay - by)) / 2);

        // Point is inside if the sum of sub-triangle areas equals the triangle area
        return Math.abs(areaABC - (areaPBC + areaPAC + areaPAB)) < 0.0001;
    }

    /**
     * Check if a line segment intersects with another line segment
     * @param {Object} a1 - First point of line segment 1
     * @param {Object} a2 - Second point of line segment 1
     * @param {Object} b1 - First point of line segment 2
     * @param {Object} b2 - Second point of line segment 2
     * @returns {boolean} True if the line segments intersect
     */
    static lineSegmentsIntersect(a1, a2, b1, b2) {
        // Calculate direction vectors
        const ua_t = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
        const ub_t = (a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x);
        const u_b = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y);

        // If u_b is 0, the lines are parallel
        if (u_b !== 0) {
            const ua = ua_t / u_b;
            const ub = ub_t / u_b;

            // If ua and ub are both between 0 and 1, the segments intersect
            if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a point is on a line segment
     * @param {Object} p - The point to check
     * @param {Object} a - Start point of the line segment
     * @param {Object} b - End point of the line segment
     * @param {number} tolerance - Distance tolerance (default 0.1)
     * @returns {boolean} True if the point is on the line segment
     */
    static pointOnLineSegment(p, a, b, tolerance = 0.1) {
        // Calculate the distance from point to line segment
        const A = p.x - a.x;
        const B = p.y - a.y;
        const C = b.x - a.x;
        const D = b.y - a.y;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;

        if (len_sq !== 0) { // in case of 0 length line
            param = dot / len_sq;
        }

        let xx, yy;

        if (param < 0) {
            xx = a.x;
            yy = a.y;
        } else if (param > 1) {
            xx = b.x;
            yy = b.y;
        } else {
            xx = a.x + param * C;
            yy = a.y + param * D;
        }

        const dx = p.x - xx;
        const dy = p.y - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < tolerance;
    }

    /**
     * Check if a hex intersects with a triangle
     * @param {Object} hex - The hex to check
     * @param {Object} a - First corner of triangle
     * @param {Object} b - Second corner of triangle
     * @param {Object} c - Third corner of triangle
     * @param {Object} layout - Layout parameters (for conversion)
     * @returns {boolean} True if the hex intersects with the triangle
     */
    static hexIntersectsTriangle(hex, a, b, c, layout) {
        // First check if the hex center is inside the triangle
        if (this.pointInTriangle(hex, a, b, c)) {
            return true;
        }

        // Convert hex and triangle corners to screen coordinates
        const hexCenter = this.hexToScreen(hex, layout);
        const aScreen = this.hexToScreen(a, layout);
        const bScreen = this.hexToScreen(b, layout);
        const cScreen = this.hexToScreen(c, layout);

        // Get the corner points of the hex
        const hexCorners = this.hexCorners(hexCenter, layout.size);

        // Check if any hex edge intersects with any triangle edge
        for (let i = 0; i < 6; i++) {
            const j = (i + 1) % 6;
            const hexEdgeStart = hexCorners[i];
            const hexEdgeEnd = hexCorners[j];

            // Check against all three triangle edges
            if (this.lineSegmentsIntersect(hexEdgeStart, hexEdgeEnd, aScreen, bScreen) ||
                this.lineSegmentsIntersect(hexEdgeStart, hexEdgeEnd, bScreen, cScreen) ||
                this.lineSegmentsIntersect(hexEdgeStart, hexEdgeEnd, cScreen, aScreen)) {
                return true;
            }

            // Also check if any hex corner is on a triangle edge
            if (this.pointOnLineSegment(hexEdgeStart, aScreen, bScreen) ||
                this.pointOnLineSegment(hexEdgeStart, bScreen, cScreen) ||
                this.pointOnLineSegment(hexEdgeStart, cScreen, aScreen)) {
                return true;
            }
        }

        // Check if any triangle corner is inside the hex
        for (const corner of [aScreen, bScreen, cScreen]) {
            // Simple hex containment check: distance from center to point <= hex size
            const dx = corner.x - hexCenter.x;
            const dy = corner.y - hexCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= layout.size) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get all hexes within a triangle and those that intersect with the triangle edges
     * @param {Object} a - First corner of triangle
     * @param {Object} b - Second corner of triangle
     * @param {Object} c - Third corner of triangle
     * @param {Object} layout - Layout parameters (for conversion)
     * @returns {Array} Array of hexes within or intersecting the triangle
     */
    static triangleHexes(a, b, c, layout) {
        // Find bounds of the triangle with a bit of margin to ensure we check all potential hexes
        const margin = 2; // Add margin to ensure we check hexes that might intersect
        const minX = Math.min(a.x, b.x, c.x) - margin;
        const maxX = Math.max(a.x, b.x, c.x) + margin;
        const minY = Math.min(a.y, b.y, c.y) - margin;
        const maxY = Math.max(a.y, b.y, c.y) + margin;
        const minZ = Math.min(a.z, b.z, c.z) - margin;
        const maxZ = Math.max(a.z, b.z, c.z) + margin;

        const results = [];

        // Check all hexes in the extended bounding box
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                // z is constrained by x + y + z = 0
                const z = -x - y;

                // Only check hexes within the valid bounds
                if (z >= minZ && z <= maxZ) {
                    const hex = { x, y, z };

                    // Check if the hex is inside or intersects with the triangle
                    if (this.pointInTriangle(hex, a, b, c) ||
                        this.hexIntersectsTriangle(hex, a, b, c, layout)) {
                        results.push(hex);
                    }
                }
            }
        }

        return results;
    }

    /**
     * Convert screen coordinates to hex coordinates
     * @param {number} screenX - X pixel coordinate
     * @param {number} screenY - Y pixel coordinate
     * @param {Object} layout - Layout parameters (origin, size, etc.)
     * @returns {Object} Hex coordinates
     */
    static screenToHex(screenX, screenY, layout) {
        // Adjust for origin
        const x = screenX - layout.origin.x;
        const y = screenY - layout.origin.y;

        // For pointy-top hexagons
        // Convert pixel coordinates to axial coordinates
        const size = layout.size;
        const q = (2.0 / 3.0 * x) / size;
        const r = (-1.0 / 3.0 * x + Math.sqrt(3) / 3.0 * y) / size;

        // Convert axial to cube and round
        return this.cubeRound(this.axialToCube(q, r));
    }

    /**
     * Convert hex coordinates to screen coordinates
     * @param {Object} hex - Hex coordinates
     * @param {Object} layout - Layout parameters (origin, size, etc.)
     * @returns {Object} Screen coordinates {x, y}
     */
    static hexToScreen(hex, layout) {
        // For pointy-top hexagons
        const size = layout.size;
        const x = size * 3.0 / 2.0 * hex.x;
        const y = size * Math.sqrt(3) * (hex.z + hex.x / 2.0);

        return {
            x: x + layout.origin.x,
            y: y + layout.origin.y
        };
    }

    /**
     * Get points for drawing a hex
     * @param {Object} center - Center point {x, y}
     * @param {number} size - Size of the hex
     * @returns {Array} Array of points for drawing
     */
    static hexCorners(center, size) {
        const corners = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            corners.push({
                x: center.x + size * Math.cos(angle),
                y: center.y + size * Math.sin(angle)
            });
        }
        return corners;
    }

    /**
     * Create a hash string for a hex to use as a key in maps
     * @param {Object} hex - Hex coordinates
     * @returns {string} Hash string
     */
    static hashHex(hex) {
        return `${hex.x},${hex.y},${hex.z}`;
    }

    /**
     * Parse a hex from a hash string
     * @param {string} hash - Hash string
     * @returns {Object} Hex coordinates
     */
    static parseHex(hash) {
        const [x, y, z] = hash.split(',').map(Number);
        return { x, y, z };
    }

    /**
     * Check if two hexes are equal
     * @param {Object} a - First hex
     * @param {Object} b - Second hex
     * @returns {boolean} Whether the hexes are equal
     */
    static equals(a, b) {
        return a.x === b.x && a.y === b.y && a.z === b.z;
    }
}
