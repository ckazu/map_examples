/**
 * Hex Map Simulator - Hex Grid
 * 
 * Main class that integrates state management and rendering.
 */

class HexGrid {
    /**
     * Create a new hex grid
     * @param {HTMLCanvasElement} canvas - The canvas element to render on
     * @param {Object} options - Grid options
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        
        // Set default options
        this.options = Object.assign({}, DEFAULT_HEX_OPTIONS, options);

        // Create layout info for coordinate conversion
        this.layout = {
            size: this.options.hexSize,
            origin: { x: canvas.width / 2 + this.options.originX, y: canvas.height / 2 + this.options.originY }
        };

        // Create grid state manager
        this.gridState = new HexGridState(this.options);
        this.gridState.setLayout(this.layout);
        
        // Create renderer
        this.renderer = new HexGridRenderer(canvas, this.layout, this.options);
        
        // Initial render
        this.render();
    }

    /**
     * Render the grid
     */
    render() {
        // Clear the canvas
        this.renderer.clear();
        
        // Render each hex
        for (const [hexHash, state] of this.gridState.hexStates) {
            const hex = HexUtils.parseHex(hexHash);
            this.renderer.renderHex(hex, state);
        }
        
        // Render connections between base cells
        if (this.gridState.connections.length > 0) {
            this.renderer.renderConnections(this.gridState.connections);
        }
    }

    /**
     * Get hex at screen coordinates
     * @param {Object} position - {x, y} screen coordinates
     * @returns {Object|null} Hex coordinates or null if not found
     */
    getHexAt(position) {
        return this.gridState.getHexAt(position, this.layout);
    }

    /**
     * Conquer a hex
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if the hex was conquered, false if already conquered
     */
    conquerHex(hex) {
        return this.gridState.conquerHex(hex);
    }

    /**
     * Unconquer a hex
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if the hex was unconquered, false if it was a base cell or not conquered
     */
    unconquerHex(hex) {
        return this.gridState.unconquerHex(hex);
    }

    /**
     * Check if a hex is a base cell
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if the hex is a base cell
     */
    isBaseCell(hex) {
        return this.gridState.isBaseCell(hex);
    }
    
    /**
     * Get base cell level
     * @param {Object} hex - Hex coordinates
     * @returns {number} Base cell level (0 if not a base cell)
     */
    getBaseCellLevel(hex) {
        return this.gridState.getBaseCellLevel(hex);
    }
    
    /**
     * Create or upgrade a base cell
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if operation was successful
     */
    createOrUpgradeBaseCell(hex) {
        return this.gridState.createOrUpgradeBaseCell(hex);
    }
    
    /**
     * Remove a base cell
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if base cell was removed
     */
    removeBaseCell(hex) {
        return this.gridState.removeBaseCell(hex);
    }
    
    /**
     * Downgrade a base cell level
     * @param {Object} hex - Hex coordinates
     * @returns {boolean} True if level was downgraded
     */
    downgradeBaseCell(hex) {
        return this.gridState.downgradeBaseCell(hex);
    }
    
    /**
     * Create a connection between base cells
     * @param {Array} hexes - Array of 2 or 3 base cells to connect
     * @returns {boolean} True if connection was created successfully
     */
    createConnection(hexes) {
        return this.gridState.createConnection(hexes);
    }

    /**
     * Reset the entire grid
     */
    resetGrid() {
        this.gridState.resetGrid();
    }

    /**
     * Get current stats
     * @returns {Object} Current statistics
     */
    getStats() {
        return this.gridState.getStats();
    }

    /**
     * Resize the canvas and adjust the grid
     * @param {number} width - New canvas width
     * @param {number} height - New canvas height 
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Update layout origin to center
        this.layout.origin = { 
            x: width / 2 + this.options.originX, 
            y: height / 2 + this.options.originY 
        };
        
        // Update layout for state and renderer
        this.gridState.setLayout(this.layout);
        this.renderer.updateLayout(this.layout);
        
        // Re-render
        this.render();
    }
    
    /**
     * Access to hex states for interaction
     */
    get hexStates() {
        return this.gridState.hexStates;
    }
}
