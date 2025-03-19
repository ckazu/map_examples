/**
 * Hex Map Simulator - Main Application
 *
 * Initializes and connects all components of the hex map simulator.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize canvas
    const canvas = document.getElementById('hex-canvas');
    const container = document.querySelector('.canvas-container');

    // Set initial canvas size
    resizeCanvas();

    // Create hex grid with options
    const hexGrid = new HexGrid(canvas, DEFAULT_HEX_OPTIONS);

    // Create UI manager
    const uiManager = new UIManager();

    // Create interaction handler
    const interactionHandler = new InteractionHandler(hexGrid, canvas, uiManager);

    // Set up button handlers
    document.getElementById('reset-btn').addEventListener('click', () => {
        interactionHandler.resetGrid();
    });

    document.getElementById('cancel-operation-btn').addEventListener('click', () => {
        interactionHandler.cancelOperation();
    });

    // Initialize help tooltip
    uiManager.initializeHelpTooltip();

    // Handle window resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        hexGrid.resize(canvas.width, canvas.height);
    });

    /**
     * Resize canvas to fit container
     */
    function resizeCanvas() {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    // Initialize UI
    interactionHandler.updateUI();
});
