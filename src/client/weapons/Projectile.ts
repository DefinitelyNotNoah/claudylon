/**
 * A visual projectile that travels through the scene via manual position updates.
 * Despawns on collision with world geometry or after a timeout.
 * Reports hit position and normal for impact marks.
 * @module client/weapons/Projectile
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Ray } from "@babylonjs/core/Culling/ray";

import "@babylonjs/core/Meshes/Builders/sphereBuilder";
import "@babylonjs/core/Culling/ray";

/**
 * Information about a projectile hit.
 */
export interface ProjectileHitInfo {
    /** World-space position of the hit. */
    position: Vector3;
    /** Surface normal at the hit point. */
    normal: Vector3;
    /** Normalized travel direction of the projectile at impact. */
    direction: Vector3;
    /** Name of the mesh that was hit (used to identify remote players). */
    hitMeshName: string;
    /** Reference to the actual mesh that was hit (for metadata lookup). */
    hitMesh: AbstractMesh | null;
}

/** Maximum lifetime for a projectile in seconds. Exported for ImGui tuning. */
export let PROJECTILE_LIFETIME = 3.0;

/** Sets the projectile lifetime. Needed because ES module `let` exports are read-only to importers. */
export function setProjectileLifetime(v: number): void {
    PROJECTILE_LIFETIME = v;
}

/** Shared material for all projectiles (created once per scene). */
let _sharedMaterial: StandardMaterial | null = null;

/**
 * Returns or creates the shared emissive projectile material.
 * @param scene - The Babylon.js scene.
 * @returns The shared projectile material.
 */
function getSharedMaterial(scene: Scene): StandardMaterial {
    if (!_sharedMaterial || _sharedMaterial.getScene() !== scene) {
        _sharedMaterial = new StandardMaterial("mat_projectile", scene);
        _sharedMaterial.emissiveColor = new Color3(1, 0.9, 0.2);
        _sharedMaterial.disableLighting = true;
    }
    return _sharedMaterial;
}

/**
 * A visible projectile that moves in a straight line each frame.
 * Uses raycasting for collision detection instead of physics bodies.
 */
export class Projectile {
    private _mesh: Mesh;
    private _scene: Scene;
    private _direction: Vector3;
    private _speed: number;
    private _age: number = 0;
    private _damage: number;
    private _disposed: boolean = false;
    private _hitInfo: ProjectileHitInfo | null = null;

    /**
     * Creates and launches a projectile.
     * @param scene - The Babylon.js scene.
     * @param origin - World-space spawn position.
     * @param direction - Normalized direction vector.
     * @param speed - Travel speed in cm/s.
     * @param size - Sphere radius.
     * @param damage - Damage dealt on hit.
     */
    constructor(
        scene: Scene,
        origin: Vector3,
        direction: Vector3,
        speed: number,
        size: number,
        damage: number
    ) {
        this._scene = scene;
        this._direction = direction.normalize();
        this._speed = speed;
        this._damage = damage;

        this._mesh = MeshBuilder.CreateSphere(
            "projectile",
            { diameter: size * 2 },
            scene
        );
        this._mesh.position = origin.clone();
        this._mesh.material = getSharedMaterial(scene);
        this._mesh.isPickable = false;
        this._mesh.metadata = { isProjectile: true };
    }

    /** Damage this projectile deals on hit. */
    public get damage(): number {
        return this._damage;
    }

    /** Hit info if the projectile collided, or null if it expired/is still flying. */
    public get hitInfo(): ProjectileHitInfo | null {
        return this._hitInfo;
    }

    /** Current world-space position of the projectile. */
    public get position(): Vector3 {
        return this._mesh.position;
    }

    /** Whether this projectile has been disposed. */
    public get isDisposed(): boolean {
        return this._disposed;
    }

    /**
     * Moves the projectile forward and checks for collisions.
     * Returns true if the projectile should be removed.
     * @param dt - Delta time in seconds.
     * @returns Whether the projectile has expired or hit something.
     */
    public update(dt: number): boolean {
        if (this._disposed) return true;

        this._age += dt;
        if (this._age >= PROJECTILE_LIFETIME) return true;

        const moveDistance = this._speed * dt;
        const ray = new Ray(this._mesh.position, this._direction, moveDistance);

        const hit = this._scene.pickWithRay(ray, (mesh) => {
            return mesh !== this._mesh
                && mesh.isPickable
                && mesh.isEnabled()
                && !mesh.metadata?.isRemoteWeapon;
        });

        if (hit && hit.hit && hit.distance < moveDistance) {
            let normal = this._direction.scale(-1).normalize();
            try {
                const n = hit.getNormal(true, true);
                if (n && n.lengthSquared() > 0.0001) normal = n.normalize();
            } catch (_) { /* fallback to inverse direction */ }
            this._hitInfo = {
                position: hit.pickedPoint ?? this._mesh.position.clone(),
                normal: normal,
                direction: this._direction.clone(),
                hitMeshName: hit.pickedMesh?.name ?? "",
                hitMesh: hit.pickedMesh ?? null,
            };
            return true;
        }

        this._mesh.position.addInPlace(this._direction.scale(moveDistance));
        return false;
    }

    /**
     * Disposes the projectile mesh.
     */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._mesh.dispose();
    }
}
