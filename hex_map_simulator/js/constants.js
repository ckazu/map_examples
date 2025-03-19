/**
 * Hex Map Simulator - Constants
 *
 * Defines constants used throughout the application.
 */

const DEFAULT_HEX_OPTIONS = {
    hexSize: 15,           // Size of hexes in pixels
    gridRadius: 20,        // How many hexes from center to edge
    originX: 0,            // X offset for rendering
    originY: 0,            // Y offset for rendering
    colors: {
        unconquered: '#e0e0e0',
        conquered: '#4a90e2',
        selected: '#ffd700',  // Base cells
        controlled: '#50c878',
        border: '#333333',
        highlight: 'rgba(255, 255, 255, 0.3)',
        selectedBorder: '#ff4500',
        level1: '#ffd700',    // Level 1 base cell
        level2: '#ffa500',    // Level 2 base cell
        level3: '#ff4500',    // Level 3 base cell
        level4: '#8B0000'     // Level 4 base cell
    },
    maxBaseLevel: 4        // Maximum level for base cells
};
