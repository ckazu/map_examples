/**
 * Hex Map Simulator - UI Manager
 * 
 * Manages UI elements and updates.
 */

class UIManager {
    /**
     * Create a new UI manager
     */
    constructor() {
        // Cache UI elements
        this.elements = {
            conqueredCount: document.getElementById('conquered-count'),
            territoryCount: document.getElementById('territory-count'),
            baseCount: document.getElementById('base-count'),
            connectionStatus: document.getElementById('connection-status'),
            modeDisplay: document.getElementById('mode-display')
        };
    }

    /**
     * Update stats display
     * @param {Object} stats - Current statistics
     */
    updateStats(stats) {
        this.elements.conqueredCount.textContent = stats.conquered;
        this.elements.territoryCount.textContent = stats.controlled;
        this.elements.baseCount.textContent = stats.baseCells || 0;
    }
    
    /**
     * Update connection status
     * @param {boolean} isCreatingConnection - Whether in connection creation mode
     * @param {number} connectionHexCount - Number of hexes in current connection
     */
    updateConnectionStatus(isCreatingConnection, connectionHexCount) {
        const connectionStatus = isCreatingConnection ? 
            `接続作成中 (${connectionHexCount}/3)` : 
            'なし';
        this.elements.connectionStatus.textContent = connectionStatus;
    }
    
    /**
     * Update mode display
     * @param {boolean} controlKeyPressed - Whether control key is pressed
     * @param {boolean} shiftKeyPressed - Whether shift key is pressed
     */
    updateModeDisplay(controlKeyPressed, shiftKeyPressed) {
        if (controlKeyPressed && shiftKeyPressed) {
            this.elements.modeDisplay.textContent = '三角形接続モード';
        } else if (controlKeyPressed) {
            this.elements.modeDisplay.textContent = '拠点接続モード';
        } else if (shiftKeyPressed) {
            this.elements.modeDisplay.textContent = '削除モード';
        } else {
            this.elements.modeDisplay.textContent = '獲得モード';
        }
    }
    
    /**
     * Update all UI elements
     * @param {Object} stats - Statistics
     * @param {Object} connectionState - Connection creation state
     * @param {Object} keyState - Key press state
     */
    updateAll(stats, connectionState, keyState) {
        this.updateStats(stats);
        this.updateConnectionStatus(connectionState.isCreating, connectionState.hexCount);
        this.updateModeDisplay(keyState.control, keyState.shift);
    }
    
    /**
     * Initialize help tooltip
     */
    initializeHelpTooltip() {
        const helpButton = document.getElementById('help-btn');
        const helpTooltip = document.getElementById('help-tooltip');
        
        helpButton.addEventListener('click', () => {
            helpTooltip.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!helpButton.contains(e.target) && !helpTooltip.contains(e.target)) {
                helpTooltip.classList.remove('show');
            }
        });
    }
}
