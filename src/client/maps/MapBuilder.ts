/**
 * Abstract base class for all map builders.
 * Each map implements this interface to construct its geometry,
 * set up spawn points, and configure lighting/shadow.
 * @module client/maps/MapBuilder
 */

import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

/**
 * Result returned after a map has been built.
 */
export interface MapBuildResult {
    /** Spawn point nodes players can be placed at. */
    spawnPoints: TransformNode[];
    /** The shadow generator created by this map (may be null if no shadows). */
    shadowGenerator: ShadowGenerator | null;
}

/**
 * Abstract map builder. Subclasses construct one specific map.
 */
export abstract class MapBuilder {
    protected _scene: Scene;

    /**
     * @param scene - The Babylon.js scene to build into.
     */
    constructor(scene: Scene) {
        this._scene = scene;
    }

    /**
     * Builds the full map: geometry, lighting, props, spawn points.
     * @returns Build result containing spawn points and shadow generator.
     */
    public abstract build(): Promise<MapBuildResult>;
}
