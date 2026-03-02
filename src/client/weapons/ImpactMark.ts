/**
 * Creates bullet impact marks on surfaces where projectiles hit.
 * Uses small dark disc meshes placed at hit points facing the surface normal.
 * @module client/weapons/ImpactMark
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import "@babylonjs/core/Meshes/Builders/discBuilder";

/** Maximum number of impact marks in the scene at once. */
const MAX_MARKS = 50;

/** How long a mark stays visible in seconds. */
const MARK_LIFETIME = 15.0;

/** Shared material for impact marks. */
let _sharedMaterial: StandardMaterial | null = null;

/**
 * Returns or creates the shared dark impact mark material.
 * @param scene - The Babylon.js scene.
 * @returns The shared impact material.
 */
function getSharedMaterial(scene: Scene): StandardMaterial {
    if (!_sharedMaterial || _sharedMaterial.getScene() !== scene) {
        _sharedMaterial = new StandardMaterial("mat_impact", scene);
        _sharedMaterial.diffuseColor = new Color3(0.05, 0.05, 0.05);
        _sharedMaterial.emissiveColor = new Color3(0.02, 0.02, 0.02);
        _sharedMaterial.disableLighting = true;
    }
    return _sharedMaterial;
}

/**
 * Tracks a single impact mark mesh with its creation time.
 */
interface MarkEntry {
    /** The disc mesh. */
    mesh: Mesh;
    /** Time of creation (seconds since manager start). */
    createdAt: number;
}

/**
 * Manages bullet impact marks on world surfaces.
 * Spawns small dark discs at hit positions oriented to the surface normal.
 * Old marks are removed after a timeout or when the pool is full.
 */
export class ImpactMarkManager {
    private _scene: Scene;
    private _marks: MarkEntry[] = [];
    private _elapsed: number = 0;

    /**
     * Creates the impact mark manager.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._scene = scene;
    }

    /**
     * Creates an impact mark at the given position facing the surface normal.
     * @param position - World-space hit position.
     * @param normal - Surface normal at the hit point.
     */
    public addMark(position: Vector3, normal: Vector3): void {
        if (this._marks.length >= MAX_MARKS) {
            const oldest = this._marks.shift();
            oldest?.mesh.dispose();
        }

        const disc = MeshBuilder.CreateDisc(
            "impact_mark",
            { radius: 3, tessellation: 8 },
            this._scene
        );
        disc.material = getSharedMaterial(this._scene);
        disc.position = position.add(normal.scale(1.0));
        disc.isPickable = false;

        /* Orient disc so its local +Z (face normal) aligns with surface normal.
         * lookAt points -Z toward target, so we look away from the normal. */
        const lookTarget = disc.position.subtract(normal);
        disc.lookAt(lookTarget);

        this._marks.push({ mesh: disc, createdAt: this._elapsed });
    }

    /**
     * Updates the manager, removing expired marks.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        this._elapsed += dt;

        while (this._marks.length > 0 && this._elapsed - this._marks[0].createdAt > MARK_LIFETIME) {
            const entry = this._marks.shift();
            entry?.mesh.dispose();
        }
    }

    /**
     * Disposes all impact marks.
     */
    public dispose(): void {
        for (const entry of this._marks) {
            entry.mesh.dispose();
        }
        this._marks = [];
    }
}
