/**
 * Hex Map Simulator - Interaction Handler
 * 
 * Handles user interactions with the hex grid.
 */

class InteractionHandler {
    /**
     * Create a new interaction handler
     * @param {HexGrid} hexGrid - The hex grid instance
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {UIManager} uiManager - The UI manager
     */
    constructor(hexGrid, canvas, uiManager) {
        this.hexGrid = hexGrid;
        this.canvas = canvas;
        this.uiManager = uiManager;
        
        // Interaction state tracking
        this.state = {
            isDragging: false,
            isCreatingConnection: false,
            connectionHexes: [],
            lastConqueredHex: null,
            mousePosition: { x: 0, y: 0 },
            controlKeyPressed: false,
            shiftKeyPressed: false
        };
        
        // Bind event handlers
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onDblClick = this.onDblClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        
        // Initialize event listeners
        this.initializeEventListeners();
    }
    
    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown);
        this.canvas.addEventListener('mousemove', this.onMouseMove);
        this.canvas.addEventListener('mouseup', this.onMouseUp);
        this.canvas.addEventListener('click', this.onClick);
        this.canvas.addEventListener('dblclick', this.onDblClick);
        
        // Add keyboard support
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        
        // Add touch support
        this.canvas.addEventListener('touchstart', this.convertTouchEvent(this.onMouseDown));
        this.canvas.addEventListener('touchmove', this.convertTouchEvent(this.onMouseMove));
        this.canvas.addEventListener('touchend', this.convertTouchEvent(this.onMouseUp));
    }
    
    /**
     * Remove event listeners
     */
    removeEventListeners() {
        this.canvas.removeEventListener('mousedown', this.onMouseDown);
        this.canvas.removeEventListener('mousemove', this.onMouseMove);
        this.canvas.removeEventListener('mouseup', this.onMouseUp);
        this.canvas.removeEventListener('click', this.onClick);
        this.canvas.removeEventListener('dblclick', this.onDblClick);
        
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        
        this.canvas.removeEventListener('touchstart', this.convertTouchEvent(this.onMouseDown));
        this.canvas.removeEventListener('touchmove', this.convertTouchEvent(this.onMouseMove));
        this.canvas.removeEventListener('touchend', this.convertTouchEvent(this.onMouseUp));
    }
    
    /**
     * Handle key down events
     * @param {KeyboardEvent} e - Keyboard event
     */
    onKeyDown(e) {
        if (e.key === 'Control' || e.key === 'Meta') {
            this.state.controlKeyPressed = true;
            this.updateUI();
        } else if (e.key === 'Shift') {
            this.state.shiftKeyPressed = true;
            this.updateUI();
        }
    }
    
    /**
     * Handle key up events
     * @param {KeyboardEvent} e - Keyboard event
     */
    onKeyUp(e) {
        if (e.key === 'Control' || e.key === 'Meta') {
            this.state.controlKeyPressed = false;
            this.updateUI();
        } else if (e.key === 'Shift') {
            this.state.shiftKeyPressed = false;
            this.updateUI();
        }
    }
    
    /**
     * Convert touch event to mouse event
     * @param {Function} callback - Mouse event callback
     * @returns {Function} Touch event handler
     */
    convertTouchEvent(callback) {
        return function(e) {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const rect = e.target.getBoundingClientRect();
                const mouseEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    target: e.target,
                    preventDefault: e.preventDefault.bind(e),
                    stopPropagation: e.stopPropagation.bind(e)
                };
                
                callback(mouseEvent);
                e.preventDefault();
            }
        };
    }
    
    /**
     * Get mouse position relative to canvas
     * @param {MouseEvent} e - Mouse event
     * @returns {Object} {x, y} coordinates
     */
    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    /**
     * Handle mouse down event
     * @param {MouseEvent} e - Mouse event
     */
    onMouseDown(e) {
        const position = this.getMousePosition(e);
        this.state.mousePosition = position;
        
        const hex = this.hexGrid.getHexAt(position);
        // If no hex found, return early
        if (!hex) return;
        
        const hexHash = HexUtils.hashHex(hex);
        const hexState = this.hexGrid.hexStates.get(hexHash);
        
        // Check if the hex state exists
        if (!hexState) {
            return;
        }
        
        // Different behavior based on modifier keys
        if (this.state.controlKeyPressed) {
            // Control key: create/manage connections between base cells
            if (hexState.conquered && this.hexGrid.isBaseCell(hex)) {
                // Only base cells can be part of connections
                // Add to connection if not already included
                const alreadyIncluded = this.state.connectionHexes.some(connHex => 
                    HexUtils.equals(connHex, hex));
                    
                if (!this.state.isCreatingConnection) {
                    // Start a new connection
                    this.state.isCreatingConnection = true;
                    this.state.connectionHexes = [hex];
                } else if (!alreadyIncluded && this.state.connectionHexes.length < 3) {
                    // Add to existing connection
                    this.state.connectionHexes.push(hex);
                    
                    // If we have enough hexes, create the connection
                    if (this.state.connectionHexes.length >= 2) {
                        this.hexGrid.createConnection(this.state.connectionHexes);
                        
                        // If we have 3 hexes or user isn't holding shift (to continue), 
                        // finish the connection
                        if (this.state.connectionHexes.length === 3 || !this.state.shiftKeyPressed) {
                            this.state.isCreatingConnection = false;
                            this.state.connectionHexes = [];
                        } else if (this.state.connectionHexes.length === 2 && this.state.shiftKeyPressed) {
                            // If we have 2 hexes and user is holding shift, keep the connection open for
                            // adding a third point to create a triangle
                            this.state.isCreatingConnection = true;
                        }
                    }
                }
                
                this.hexGrid.render();
                this.updateUI();
            }
        } else if (this.state.shiftKeyPressed) {
            // Shift key: Downgrade base cell level or unconquer hex
            if (this.hexGrid.isBaseCell(hex)) {
                // Downgrade the base cell level
                this.hexGrid.downgradeBaseCell(hex);
                this.hexGrid.render();
                this.updateUI();
            } else if (hexState.conquered) {
                // Unconquer regular hex
                this.hexGrid.unconquerHex(hex);
                this.hexGrid.render();
                this.updateUI();
            }
        } else {
            // No modifier keys: Regular conquest by dragging
            if (!hexState.conquered) {
                this.state.isDragging = true;
                this.hexGrid.conquerHex(hex);
                this.state.lastConqueredHex = hex;
                this.hexGrid.render();
                this.updateUI();
            }
        }
    }
    
    /**
     * Handle mouse move event
     * @param {MouseEvent} e - Mouse event
     */
    onMouseMove(e) {
        const position = this.getMousePosition(e);
        this.state.mousePosition = position;
        
        // If we're dragging, conquer hexes
        if (this.state.isDragging) {
            const hex = this.hexGrid.getHexAt(position);
            if (!hex) return;
            
            // Only conquer if this is a new hex and we have a valid last conquered hex
            if (!this.state.lastConqueredHex) {
                this.state.lastConqueredHex = hex;
                return;
            }
            
            if (!HexUtils.equals(hex, this.state.lastConqueredHex)) {
                // Check if the new hex is adjacent to the last one for smoother dragging
                const neighbors = HexUtils.neighbors(this.state.lastConqueredHex);
                let isNeighbor = false;
                
                for (const neighbor of neighbors) {
                    if (HexUtils.equals(neighbor, hex)) {
                        isNeighbor = true;
                        break;
                    }
                }
                
                if (isNeighbor) {
                    if (this.hexGrid.conquerHex(hex)) {
                        this.state.lastConqueredHex = hex;
                        this.hexGrid.render();
                        this.updateUI();
                    }
                }
            }
        }
    }
    
    /**
     * Handle mouse up event
     * @param {MouseEvent} e - Mouse event
     */
    onMouseUp(e) {
        // End dragging
        this.state.isDragging = false;
        this.state.lastConqueredHex = null;
    }
    
    /**
     * Handle click event
     * @param {MouseEvent} e - Mouse event
     */
    onClick(e) {
        // Click is handled by mousedown for selection
        // This prevents double processing
    }
    
    /**
     * Handle double click event
     * @param {MouseEvent} e - Mouse event
     */
    onDblClick(e) {
        const position = this.getMousePosition(e);
        const hex = this.hexGrid.getHexAt(position);
        
        // If no hex found, return early
        if (!hex) return;
        
        const hexHash = HexUtils.hashHex(hex);
        const hexState = this.hexGrid.hexStates.get(hexHash);
        
        // Check if the hex state exists and is conquered
        if (!hexState || !hexState.conquered) return;
        
        // Different behavior based on if it's already a base cell
        if (this.hexGrid.isBaseCell(hex)) {
            // Upgrade the base cell if it exists
            this.hexGrid.createOrUpgradeBaseCell(hex);
        } else {
            // Create a new base cell
            this.hexGrid.createOrUpgradeBaseCell(hex);
        }
        
        this.hexGrid.render();
        this.updateUI();
    }
    
    /**
     * Cancel the current selection operation
     */
    cancelOperation() {
        this.state.isCreatingConnection = false;
        this.state.connectionHexes = [];
        this.hexGrid.render();
        this.updateUI();
    }
    
    /**
     * Reset the entire grid
     */
    resetGrid() {
        this.hexGrid.resetGrid();
        this.state = {
            isDragging: false,
            isCreatingConnection: false,
            connectionHexes: [],
            lastConqueredHex: null,
            mousePosition: { x: 0, y: 0 },
            controlKeyPressed: false,
            shiftKeyPressed: false
        };
        this.hexGrid.render();
        this.updateUI();
    }
    
    /**
     * Update UI elements with current stats and selection info
     */
    updateUI() {
        // Get the current stats
        const stats = this.hexGrid.getStats();
        
        // Update UI through the UI manager
        this.uiManager.updateAll(
            stats,
            {
                isCreating: this.state.isCreatingConnection,
                hexCount: this.state.connectionHexes.length
            },
            {
                control: this.state.controlKeyPressed,
                shift: this.state.shiftKeyPressed
            }
        );
    }
}
