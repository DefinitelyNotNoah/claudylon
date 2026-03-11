/**
 * Factory for creating map builder instances by map ID.
 * @module client/maps/MapFactory
 */

import type { Scene } from "@babylonjs/core/scene";
import type { MapId } from "../../shared/constants/MapRegistry";
import { MapBuilder } from "./MapBuilder";
import { ShipmentMap } from "./ShipmentMap";
import { PlaygroundMap } from "./PlaygroundMap";

/**
 * Creates the appropriate MapBuilder for the given map ID.
 * @param mapId - The map identifier from MapRegistry.
 * @param scene - The Babylon.js scene to build into.
 * @returns A MapBuilder ready to call build() on.
 */
export function createMapBuilder(mapId: MapId, scene: Scene): MapBuilder {
    switch (mapId) {
        case "shipment":
            return new ShipmentMap(scene);
        case "playground":
            return new PlaygroundMap(scene);
        default:
            // Exhaustive check — TypeScript will flag unhandled MapId values
            const _exhaustive: never = mapId;
            throw new Error(`Unknown map ID: ${_exhaustive}`);
    }
}
