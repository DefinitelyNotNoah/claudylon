/**
 * A dropped weapon entity with Havok physics.
 * Spawned when a player or bot dies; falls, bounces, and settles on the ground.
 * @module client/weapons/WeaponDrop
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";

import { WEAPON_STATS } from "../../shared/constants";
import type { WeaponId } from "../../shared/types";

import "@babylonjs/core/Meshes/Builders/boxBuilder";

/** Maximum lifetime for a dropped weapon in seconds. */
const DROP_LIFETIME = 30;

/** Monotonically increasing counter for unique drop names. */
let _dropCounter = 0;

/**
 * Represents a single dropped weapon on the ground with a dynamic physics body.
 * Created via the static `WeaponDrop.create()` factory.
 */
export class WeaponDrop {
    private _root: Mesh;
    private _meshes: AbstractMesh[];
    private _aggregate: PhysicsAggregate;
    private _weaponId: WeaponId;
    private _currentAmmo: number;
    private _reserveAmmo: number;
    private _age: number = 0;
    private _disposed: boolean = false;

    /**
     * Private constructor — use `WeaponDrop.create()` instead.
     */
    private constructor(
        root: Mesh,
        meshes: AbstractMesh[],
        aggregate: PhysicsAggregate,
        weaponId: WeaponId,
        currentAmmo: number,
        reserveAmmo: number
    ) {
        this._root = root;
        this._meshes = meshes;
        this._aggregate = aggregate;
        this._weaponId = weaponId;
        this._currentAmmo = currentAmmo;
        this._reserveAmmo = reserveAmmo;
    }

    /** The weapon type this drop represents. */
    public get weaponId(): WeaponId {
        return this._weaponId;
    }

    /** Current world-space position of the drop. */
    public get position(): Vector3 {
        return this._root.position;
    }

    /** Rounds in the magazine when this weapon was dropped. */
    public get currentAmmo(): number {
        return this._currentAmmo;
    }

    /** Reserve rounds when this weapon was dropped. */
    public get reserveAmmo(): number {
        return this._reserveAmmo;
    }

    /** How many seconds this drop has existed. */
    public get age(): number {
        return this._age;
    }

    /** Whether this drop has been disposed. */
    public get isDisposed(): boolean {
        return this._disposed;
    }

    /**
     * Creates a dropped weapon entity with physics.
     * @param scene - The Babylon.js scene.
     * @param weaponId - Which weapon to drop.
     * @param spawnPosition - World-space position to spawn the drop at.
     * @param spawnYaw - Y rotation in radians (facing direction of the deceased).
     * @param currentAmmo - Rounds in the magazine when dropped (-1 = full).
     * @param reserveAmmo - Reserve rounds when dropped (-1 = full).
     * @returns The new WeaponDrop instance.
     */
    public static async create(
        scene: Scene,
        weaponId: WeaponId,
        spawnPosition: Vector3,
        spawnYaw: number,
        currentAmmo: number = -1,
        reserveAmmo: number = -1
    ): Promise<WeaponDrop> {
        const stats = WEAPON_STATS[weaponId];
        const id = _dropCounter++;

        // Invisible box as the physics body host
        const root = MeshBuilder.CreateBox(
            `weapon_drop_${weaponId}_${id}`,
            { width: 20, height: 10, depth: 40 },
            scene
        );
        root.position = spawnPosition.clone();
        root.rotationQuaternion = null;
        root.rotation.y = spawnYaw;
        root.isVisible = false;
        root.isPickable = false;
        root.metadata = { isWeaponDrop: true };

        // Load the weapon GLB
        const url = `assets/weapons/${stats.modelFile}`;
        const result = await ImportMeshAsync(url, scene, {});
        const meshes = result.meshes as AbstractMesh[];
        const glbRoot = result.meshes[0] as unknown as TransformNode;

        // Parent GLB to the physics box
        glbRoot.parent = root;
        glbRoot.position = Vector3.Zero();
        glbRoot.rotationQuaternion = null;
        glbRoot.rotation = Vector3.Zero();

        // Scale using dropScale from weapon stats
        const s = stats.dropScale;
        glbRoot.scaling = new Vector3(s, s, s);

        // Mark all meshes for raycast filtering
        for (const mesh of meshes) {
            mesh.metadata = { isWeaponDrop: true };
            mesh.isPickable = false;
            mesh.checkCollisions = false;
        }

        // Create dynamic physics body
        const aggregate = new PhysicsAggregate(
            root,
            PhysicsShapeType.BOX,
            { mass: 5, restitution: 0.3, friction: 0.8 },
            scene
        );

        // Apply initial velocity: upward + slight random horizontal
        const body = aggregate.body;
        const upVel = 200;
        const horizPush = 80;
        body.setLinearVelocity(new Vector3(
            (Math.random() - 0.5) * horizPush,
            upVel,
            (Math.random() - 0.5) * horizPush
        ));
        // Add a bit of spin
        body.setAngularVelocity(new Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 5
        ));

        // Resolve -1 defaults to full ammo
        const actualCurrentAmmo = currentAmmo >= 0 ? currentAmmo : stats.magazineSize;
        const actualReserveAmmo = reserveAmmo >= 0 ? reserveAmmo : stats.magazineSize * stats.magazineCount;

        return new WeaponDrop(root, meshes, aggregate, weaponId, actualCurrentAmmo, actualReserveAmmo);
    }

    /**
     * Updates the drop's age. Returns true when the drop has expired.
     * @param dt - Delta time in seconds.
     * @returns Whether the drop has exceeded its lifetime.
     */
    public update(dt: number): boolean {
        if (this._disposed) return true;
        this._age += dt;
        return this._age >= DROP_LIFETIME;
    }

    /**
     * Disposes the physics body, meshes, and root node.
     */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._aggregate.dispose();
        for (const mesh of this._meshes) {
            mesh.dispose();
        }
        this._root.dispose();
    }
}
