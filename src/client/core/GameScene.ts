/**
 * Abstract base class for all game scenes.
 * Each scene owns a Babylon.js Scene instance and manages its own lifecycle.
 * @module client/core/GameScene
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import "@babylonjs/core/Physics";

import type { GameManager } from "./GameManager";

/**
 * Base class that all game scenes extend.
 * Provides access to the GameManager, a Babylon Scene, and physics setup.
 */
export abstract class GameScene {
    /** Reference to the game manager singleton. */
    protected _manager: GameManager;

    /** The Babylon.js scene owned by this game scene. */
    protected _scene: Scene;

    /**
     * Creates a new GameScene with its own Babylon.js Scene.
     * @param manager - The GameManager singleton providing engine and Havok access.
     */
    constructor(manager: GameManager) {
        this._manager = manager;
        this._scene = new Scene(manager.engine);
    }

    /** The underlying Babylon.js scene. */
    public get scene(): Scene {
        return this._scene;
    }

    /**
     * Called after construction to set up physics, load assets, and build geometry.
     * Subclasses must implement this.
     */
    public abstract initialize(): Promise<void>;

    /**
     * Tears down the scene and releases resources.
     */
    public dispose(): void {
        this._scene.dispose();
    }

    /**
     * Enables Havok physics on this scene using the shared WASM instance.
     * Raises the default velocity limits for cm-scale worlds (Havok defaults
     * to 200 units/s which is only 2 m/s when the world uses centimeters).
     * @param gravity - Gravity vector applied to all physics bodies.
     */
    protected _enablePhysics(gravity: Vector3): void {
        const plugin = new HavokPlugin(true, this._manager.havokInstance);
        this._scene.enablePhysics(gravity, plugin);

        // Havok defaults to max linear velocity = 200 units/s (tuned for meters).
        // Our world uses centimeters, so we need a much higher cap.
        // 10000 cm/s = 100 m/s — fast enough for ragdoll launches.
        plugin.setVelocityLimits(10000, 100);
    }
}
