/**
 * Hex Map Simulator - Hex Grid State
 * 
 * Manages the state of the hex grid.
 */

class HexGridState {
    /**
     * Create a new hex grid state manager
     * @param {Object} options - Grid options
     */
    constructor(options) {
        this.options = options;
        
        // Map to track hex states
        this.hexStates = new Map(); // Maps hex hashes to their state

        // Track base cells with their level
        this.baseCells = new Map(); // Maps hex hashes to base cell info
        
        // Track connections between base cells
        this.connections = []; // Arrays of connected base cells (2 for lines, 3 for triangles)
        
        // Track territories (groups of controlled hexes)
        this.territories = [];
        
        // Initialize stats counters
        this.stats = {
            conquered: 0,
            controlled: 0,
            baseCells: 0
        };

        // Initialize grid
        this.initializeGrid();
    }

    /**
     * Initialize the grid with hexes
     */
    initializeGrid() {
        // Create hexes within the grid radius
        for (let q = -this.options.gridRadius; q <= this.options.gridRadius; q++) {
            const r1 = Math.max(-this.options.gridRadius, -q - this.options.gridRadius);
            const r2 = Math.min(this.options.gridRadius, -q + this.options.gridRadius);
            
            for (let r = r1; r <= r2; r++) {
                const hex = HexUtils.axialToCube(q, r);
                const hexHash = HexUtils.hashHex(hex);
                
                // All hexes start as unconquered
                this.hexStates.set(hexHash, {
                    conquered: false,
                    selected: false,  // Base cell selection
                    controlled: false,
                    baseLevel: 0,     // 0 means not a base cell, 1-3 for levels
                    hex: hex
                });
            }
        }
    }

    /**
     * Get hex at screen coordinates
     * @param {Object} position - Screen position {x, y}
     * @param {Object} layout - Layout parameters
     * @returns {Object|null} Hex coordinates or null if not found
     */
    getHexAt(position, layout) {
        // Calculate hex coordinates from screen position
        const hex = HexUtils.screenToHex(position.x, position.y, layout);
        const hexHash = HexUtils.hashHex(hex);
        
        // Check if this hex exists in our grid
        if (this.hexStates.has(hexHash)) {
            return hex;
        }
        
        return null;
    }

    /**
     * Conquer a hex
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if the hex was conquered, false if already conquered
     */
    conquerHex(hex) {
        const hexHash = HexUtils.hashHex(hex);
        const state = this.hexStates.get(hexHash);
        
        if (!state) return false;
        
        // Only update if not already conquered
        if (!state.conquered) {
            state.conquered = true;
            this.stats.conquered++;
            return true;
        }
        
        return false;
    }

    /**
     * Unconquer a hex
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if the hex was unconquered, false if it was a base cell or not conquered
     */
    unconquerHex(hex) {
        const hexHash = HexUtils.hashHex(hex);
        const state = this.hexStates.get(hexHash);
        
        if (!state || !state.conquered) return false;
        
        // Can't unconquer a base cell
        if (this.isBaseCell(hex)) return false;
        
        // Remove from any territories
        if (state.controlled) {
            this.removeHexFromTerritories(hex);
        }
        
        // Update state and stats
        state.conquered = false;
        state.controlled = false;
        this.stats.conquered--;
        
        return true;
    }

    /**
     * Remove a hex from all territories it belongs to
     * @param {Object} hex - Hex coordinates 
     */
    removeHexFromTerritories(hex) {
        const hexHash = HexUtils.hashHex(hex);
        
        // Find territories containing this hex
        const affectedTerritories = [];
        for (let i = 0; i < this.territories.length; i++) {
            if (this.territories[i].hexes.includes(hexHash)) {
                affectedTerritories.push(i);
                this.stats.controlled--;
            }
        }
        
        // Remove hex from territories
        for (const index of affectedTerritories) {
            const hexIndex = this.territories[index].hexes.indexOf(hexHash);
            if (hexIndex !== -1) {
                this.territories[index].hexes.splice(hexIndex, 1);
            }
        }
    }

    /**
     * Check if a hex is a base cell
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if the hex is a base cell
     */
    isBaseCell(hex) {
        const hexHash = HexUtils.hashHex(hex);
        return this.baseCells.has(hexHash);
    }
    
    /**
     * Downgrade a base cell level
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if operation was successful
     */
    downgradeBaseCell(hex) {
        const hexHash = HexUtils.hashHex(hex);
        if (!this.baseCells.has(hexHash)) return false;
        
        const baseCell = this.baseCells.get(hexHash);
        const state = this.hexStates.get(hexHash);
        
        if (baseCell.level > 1) {
            // Downgrade the level
            baseCell.level--;
            state.baseLevel = baseCell.level;
            return true;
        } else {
            // If level is 1, remove the base cell
            this.removeBaseCell(hex);
            return true;
        }
    }
    
    /**
     * Get base cell level
     * @param {Object} hex - Hex coordinates
     * @returns {number} Base cell level (0 if not a base cell)
     */
    getBaseCellLevel(hex) {
        const hexHash = HexUtils.hashHex(hex);
        if (!this.baseCells.has(hexHash)) return 0;
        return this.baseCells.get(hexHash).level || 0;
    }
    
    /**
     * Create or upgrade a base cell
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if operation was successful
     */
    createOrUpgradeBaseCell(hex) {
        const hexHash = HexUtils.hashHex(hex);
        const state = this.hexStates.get(hexHash);
        
        // Can only create base cells on conquered hexes
        if (!state || !state.conquered) return false;
        
        // If it's already a base cell, upgrade it
        if (this.baseCells.has(hexHash)) {
            const baseCell = this.baseCells.get(hexHash);
            if (baseCell.level < this.options.maxBaseLevel) {
                // Upgrade the base cell
                baseCell.level++;
                state.baseLevel = baseCell.level;
                
                // For higher level cells, try to conquer adjacent cells
                if (baseCell.level >= 2) {
                    this.conquerAdjacentCells(hex, baseCell.level - 1);
                }
                
                return true;
            }
            return false; // Already at max level
        }
        
        // Create a new base cell
        state.selected = true;
        state.baseLevel = 1;
        this.baseCells.set(hexHash, { 
            hex: hex, 
            level: 1,
            connections: []
        });
        this.stats.baseCells++;
        
        return true;
    }
    
    /**
     * Conquer adjacent cells based on base cell level
     * @param {Object} baseHex - Base cell hex coordinates
     * @param {number} radius - Radius of cells to conquer
     */
    conquerAdjacentCells(baseHex, radius) {
        if (radius <= 0) return;
        
        // Get all hexes within radius
        const neighbors = [];
        for (let r = 1; r <= radius; r++) {
            // Get ring of hexes at distance r
            let hex = baseHex;
            // Move to starting position for the ring
            for (let i = 0; i < r; i++) {
                hex = HexUtils.neighbor(hex, 4); // Move in direction 4
            }
            
            // Traverse the ring
            for (let dir = 0; dir < 6; dir++) {
                for (let j = 0; j < r; j++) {
                    neighbors.push(hex);
                    hex = HexUtils.neighbor(hex, dir);
                }
            }
        }
        
        // Conquer all hexes in range
        for (const hex of neighbors) {
            this.conquerHex(hex);
        }
    }
    
    /**
     * Remove a base cell
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if base cell was removed
     */
    removeBaseCell(hex) {
        const hexHash = HexUtils.hashHex(hex);
        if (!this.baseCells.has(hexHash)) return false;
        
        // Remove from base cells collection
        this.baseCells.delete(hexHash);
        
        // Update hex state
        const state = this.hexStates.get(hexHash);
        if (state) {
            state.selected = false;
            state.baseLevel = 0;
        }
        
        // Remove any connections involving this base cell
        this.removeConnectionsWithBaseCell(hex);
        
        // Update stats
        this.stats.baseCells--;
        
        return true;
    }
    
    /**
     * Remove all connections involving a specific base cell
     * @param {Object} hex - Hex coordinates
     */
    removeConnectionsWithBaseCell(hex) {
        // Filter out connections containing this hex
        const affectedConnections = [];
        this.connections = this.connections.filter(conn => {
            const hasHex = conn.some(connHex => HexUtils.equals(connHex, hex));
            if (hasHex) {
                affectedConnections.push(conn);
                return false;
            }
            return true;
        });
        
        // Clear territory control for affected connections
        this.clearTerritoryControlForConnections(affectedConnections);
    }
    
    /**
     * Create a connection between base cells
     * @param {Array} hexes - Array of 2 or 3 base cells to connect
     * @returns {boolean} True if connection was created successfully
     */
    createConnection(hexes) {
        // Validate parameters
        if (!Array.isArray(hexes) || (hexes.length !== 2 && hexes.length !== 3)) {
            return false;
        }
        
        // Check if all hexes are base cells
        if (!hexes.every(hex => this.isBaseCell(hex))) {
            return false;
        }
        
        // Check if this exact connection already exists
        const connectionExists = this.connections.some(conn => {
            if (conn.length !== hexes.length) return false;
            
            // Check if all hexes in the connection match
            return hexes.every(hex => 
                conn.some(connHex => HexUtils.equals(connHex, hex))
            );
        });
        
        if (connectionExists) return false;
        
        // Add the new connection
        this.connections.push([...hexes]);
        
        // Apply territory control for this connection
        this.applyTerritoryControlForConnection(hexes);
        
        return true;
    }
    
    /**
     * Apply territory control for a specific connection
     * @param {Array} connection - Array of connected base cells
     */
    applyTerritoryControlForConnection(connection) {
        if (connection.length === 2) {
            this.applyLineTerritory(connection[0], connection[1]);
        } else if (connection.length === 3) {
            this.applyTriangleTerritory(connection[0], connection[1], connection[2]);
        }
    }

    /**
     * Apply line-based territory control
     * @param {Object} hex1 - First base cell
     * @param {Object} hex2 - Second base cell
     */
    applyLineTerritory(hex1, hex2) {
        // Get hexes directly on the line and those that intersect with it
        const lineHexes = HexUtils.lineHexes(hex1, hex2, this.layout);
        
        // Control all hexes on and intersecting the line
        let controlled = 0;
        for (const hex of lineHexes) {
            const hexHash = HexUtils.hashHex(hex);
            
            // Only apply if the hex exists in our grid and isn't already controlled
            if (this.hexStates.has(hexHash)) {
                const state = this.hexStates.get(hexHash);
                if (!state.controlled) {
                    state.controlled = true;
                    controlled++;
                }
            }
        }
        
        this.stats.controlled += controlled;
        this.territories.push({
            type: 'line',
            baseHexes: [hex1, hex2],
            hexes: lineHexes.map(hex => HexUtils.hashHex(hex))
        });
    }

    /**
     * Apply triangle-based territory control
     * @param {Object} hex1 - First base cell
     * @param {Object} hex2 - Second base cell
     * @param {Object} hex3 - Third base cell
     */
    applyTriangleTerritory(hex1, hex2, hex3) {
        // Check if the three points are collinear (in a straight line)
        const distance1 = HexUtils.distance(hex1, hex2);
        const distance2 = HexUtils.distance(hex2, hex3);
        const distance3 = HexUtils.distance(hex1, hex3);
        
        // If the sum of two distances equals the third distance (with a small tolerance), the points are collinear
        const areCollinear = (
            Math.abs(distance1 + distance2 - distance3) < 0.01 ||
            Math.abs(distance2 + distance3 - distance1) < 0.01 ||
            Math.abs(distance3 + distance1 - distance2) < 0.01
        );
        
        let hexesToControl = [];
        
        if (areCollinear) {
            // If collinear, treat as connected line segments
            const line1 = HexUtils.lineHexes(hex1, hex2, this.layout);
            const line2 = HexUtils.lineHexes(hex2, hex3, this.layout);
            
            // Combine lines and remove duplicates
            const allLineHexes = new Set();
            [...line1, ...line2].forEach(hex => {
                allLineHexes.add(HexUtils.hashHex(hex));
            });
            
            hexesToControl = Array.from(allLineHexes).map(hash => HexUtils.parseHex(hash));
        } else {
            // Normal triangle case
            hexesToControl = HexUtils.triangleHexes(hex1, hex2, hex3, this.layout);
        }
        
        // Control all hexes in and intersecting the triangle/lines
        let controlled = 0;
        for (const hex of hexesToControl) {
            const hexHash = HexUtils.hashHex(hex);
            if (this.hexStates.has(hexHash)) {
                const state = this.hexStates.get(hexHash);
                if (!state.controlled) {
                    state.controlled = true;
                    controlled++;
                }
            }
        }
        
        this.stats.controlled += controlled;
        this.territories.push({
            type: areCollinear ? 'collinear' : 'triangle',
            baseHexes: [hex1, hex2, hex3],
            hexes: hexesToControl.map(hex => HexUtils.hashHex(hex))
        });
    }

    /**
     * Clear territory control for specific connections
     * @param {Array} connections - Array of connections to clear
     */
    clearTerritoryControlForConnections(connections) {
        if (!connections.length) return;
        
        // Find all hexes controlled by these connections
        const territoriesToRemove = [];
        const controlledHexes = new Set();
        
        // For each territory, check if it was created by one of the connections
        this.territories.forEach((territory, index) => {
            // Try to find a matching connection
            const isFromConnection = connections.some(conn => {
                // Line territories have 2 base cells, triangles have 3
                if ((territory.type === 'line' && conn.length === 2) ||
                    (territory.type === 'triangle' && conn.length === 3) ||
                    (territory.type === 'collinear' && conn.length === 3)) {
                    
                    // Check if territory vertices match our connection hexes
                    const allBaseHexesMatch = conn.every(connHex => {
                        // Territory.baseHexes should contain this hex
                        return territory.baseHexes && territory.baseHexes.some(baseHex => 
                            HexUtils.equals(baseHex, connHex));
                    });
                    
                    return allBaseHexesMatch;
                }
                return false;
            });
            
            if (isFromConnection) {
                // This territory should be removed
                territoriesToRemove.push(index);
                
                // Add its hexes to the set of controlled hexes to clear
                territory.hexes.forEach(hexHash => controlledHexes.add(hexHash));
            }
        });
        
        // Remove territories (in reverse order to not mess up indices)
        for (let i = territoriesToRemove.length - 1; i >= 0; i--) {
            this.territories.splice(territoriesToRemove[i], 1);
        }
        
        // Clear controlled status for affected hexes
        let clearedCount = 0;
        controlledHexes.forEach(hexHash => {
            const state = this.hexStates.get(hexHash);
            if (state && state.controlled) {
                state.controlled = false;
                clearedCount++;
            }
        });
        
        // Update controlled count
        this.stats.controlled -= clearedCount;
    }
    
    /**
     * Clear all territory control
     */
    clearTerritoryControl() {
        // Find all hexes that were part of territories
        const controlledHexes = [];
        for (const territory of this.territories) {
            for (const hexHash of territory.hexes) {
                const state = this.hexStates.get(hexHash);
                if (state && state.controlled) {
                    controlledHexes.push(hexHash);
                }
            }
        }
        
        // Clear controlled status
        for (const hexHash of controlledHexes) {
            const state = this.hexStates.get(hexHash);
            if (state) {
                state.controlled = false;
            }
        }
        
        // Reset controlled count
        this.stats.controlled = 0;
        
        // Clear territories
        this.territories = [];
        
        // Clear connections
        this.connections = [];
    }

    /**
     * Reset the entire grid
     */
    resetGrid() {
        // Reset hex states
        for (const state of this.hexStates.values()) {
            state.conquered = false;
            state.selected = false;
            state.controlled = false;
            state.baseLevel = 0;
        }
        
        // Clear base cells, connections and territories
        this.baseCells.clear();
        this.connections = [];
        this.territories = [];
        
        // Reset stats
        this.stats.conquered = 0;
        this.stats.controlled = 0;
        this.stats.baseCells = 0;
    }

    /**
     * Get current stats
     * @returns {Object} Current statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Set the layout for calculations
     * @param {Object} layout - Layout object
     */
    setLayout(layout) {
        this.layout = layout;
    }
}
