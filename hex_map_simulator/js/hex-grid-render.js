/**
 * Hex Map Simulator - Hex Grid Renderer
 * 
 * Handles rendering of the hex grid on the canvas.
 */

class HexGridRenderer {
    /**
     * Create a new hex grid renderer
     * @param {HTMLCanvasElement} canvas - The canvas element to render on
     * @param {Object} layout - Grid layout info
     * @param {Object} options - Rendering options
     */
    constructor(canvas, layout, options) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.layout = layout;
        this.options = options;
    }

    /**
     * Clear the canvas
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Render a single hex
     * @param {Object} hex - Hex coordinates
     * @param {Object} state - Hex state
     */
    renderHex(hex, state) {
        const center = HexUtils.hexToScreen(hex, this.layout);
        const corners = HexUtils.hexCorners(center, this.options.hexSize);
        
        // Begin the path for the hex
        this.ctx.beginPath();
        this.ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            this.ctx.lineTo(corners[i].x, corners[i].y);
        }
        this.ctx.closePath();
        
        // Fill based on state - controlled cells keep the same color as conquered
        if (state.selected) {
            // Use color based on base cell level
            if (state.baseLevel > 0) {
                const levelColor = `level${state.baseLevel}`;
                this.ctx.fillStyle = this.options.colors[levelColor];
            } else {
                this.ctx.fillStyle = this.options.colors.selected;
            }
        } else if (state.conquered || state.controlled) {
            this.ctx.fillStyle = this.options.colors.conquered;
        } else {
            this.ctx.fillStyle = this.options.colors.unconquered;
        }
        this.ctx.fill();
        
        // Border style
        if (state.selected) {
            this.ctx.strokeStyle = this.options.colors.selectedBorder;
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = this.options.colors.border;
            this.ctx.lineWidth = 1;
        }
        this.ctx.stroke();
        
        // Add a marker for controlled territory
        if (state.controlled && !state.selected) {
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, this.options.hexSize / 4, 0, Math.PI * 2);
            this.ctx.fillStyle = this.options.colors.controlled;
            this.ctx.fill();
            
            // Add border to the marker for better visibility
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        
        // Display base cell level if it's a base cell
        if (state.baseLevel > 0) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `${this.options.hexSize / 2}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(state.baseLevel.toString(), center.x, center.y);
        }
    }

    /**
     * Render connections between base cells
     * @param {Array} connections - Array of connection arrays
     */
    renderConnections(connections) {
        this.ctx.strokeStyle = this.options.colors.selectedBorder;
        this.ctx.lineWidth = 2;
        
        // Draw connections between base cells
        for (const connection of connections) {
            // Skip invalid connections
            if (connection.length < 2) continue;
            
            // Get screen coordinates for each hex in this connection
            const centers = connection.map(hex => HexUtils.hexToScreen(hex, this.layout));
            
            // For line connections (2 hexes)
            if (connection.length === 2) {
                this.ctx.beginPath();
                this.ctx.moveTo(centers[0].x, centers[0].y);
                this.ctx.lineTo(centers[1].x, centers[1].y);
                this.ctx.stroke();
            }
            // For triangle connections (3 hexes)
            else if (connection.length === 3) {
                // Draw triangle edges
                this.ctx.beginPath();
                this.ctx.moveTo(centers[0].x, centers[0].y);
                this.ctx.lineTo(centers[1].x, centers[1].y);
                this.ctx.lineTo(centers[2].x, centers[2].y);
                this.ctx.closePath();
                this.ctx.stroke();
                
                // Fill triangle with transparent color
                this.ctx.fillStyle = 'rgba(255, 215, 0, 0.2)'; // Transparent gold
                this.ctx.fill();
            }
        }
    }

    /**
     * Update the layout for the renderer
     * @param {Object} layout - New layout
     */
    updateLayout(layout) {
        this.layout = layout;
    }

    /**
     * Update the options for the renderer
     * @param {Object} options - New options
     */
    updateOptions(options) {
        this.options = options;
    }
}
