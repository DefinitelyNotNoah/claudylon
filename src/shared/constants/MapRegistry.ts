/**
 * Registry of available maps with metadata.
 * @module shared/constants/MapRegistry
 */

/**
 * Unique identifier for a map.
 */
export type MapId = "shipment" | "playground";

/**
 * Metadata describing a map available in the game.
 */
export interface MapInfo {
    /** Unique map identifier. */
    id: MapId;
    /** Human-readable display name. */
    displayName: string;
    /** Short description shown in map selection UI. */
    description: string;
    /** Recommended player count range. */
    playerRange: string;
}

/**
 * All maps available for play. Add new entries here to register a map.
 */
export const MAP_REGISTRY: MapInfo[] = [
    {
        id: "shipment",
        displayName: "Shipment",
        description: "Compact shipping yard — close-quarters chaos.",
        playerRange: "2–8",
    },
    {
        id: "playground",
        displayName: "Playground",
        description: "Open test environment with ramps, platforms, and cover.",
        playerRange: "2–6",
    },
];

/** localStorage key for persisting the selected map. */
export const SELECTED_MAP_KEY = "fps_selected_map";

/** Default map ID if no selection is stored. */
export const DEFAULT_MAP_ID: MapId = "shipment";
