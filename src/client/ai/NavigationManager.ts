/**
 * Wraps Babylon.js RecastJSPlugin to provide navmesh pathfinding.
 * Bakes a navmesh once from scene geometry (ground, walls, props)
 * and provides path queries for bot AI.
 * @module client/ai/NavigationManager
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { RecastJSPlugin } from "@babylonjs/core/Navigation/Plugins/recastJSPlugin";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import "@babylonjs/core/Navigation/Plugins/recastJSPlugin";

/**
 * NavMesh parameters tuned for cm-scale world.
 * cs/ch: 20cm cell size (good for 180cm tall, 40cm radius characters).
 * walkableHeight: 9 cells = 180cm.
 * walkableRadius: 2 cells = 40cm.
 * walkableClimb: 1 cell = 20cm (step height).
 */
const NAVMESH_PARAMS = {
    cs: 20,
    ch: 20,
    walkableSlopeAngle: 35,
    walkableHeight: 9,
    walkableClimb: 1,
    walkableRadius: 2,
    maxEdgeLen: 60,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 60,
    detailSampleMaxError: 1,
};

/**
 * Mesh name prefixes to include in navmesh baking.
 * Matches naming conventions from MatchScene.
 */
const NAVMESH_MESH_PREFIXES = ["map_", "boundary_", "prop_"];

/**
 * Manages navmesh creation and pathfinding queries for bot AI.
 */
export class NavigationManager {
    private _scene: Scene;
    private _plugin: RecastJSPlugin | null = null;

    /**
     * Creates a new NavigationManager.
     * @param scene - The Babylon.js scene containing map geometry.
     */
    constructor(scene: Scene) {
        this._scene = scene;
    }

    /**
     * Initializes the Recast WASM module, creates the RecastJSPlugin,
     * and bakes the navmesh from scene geometry.
     */
    public async initialize(): Promise<void> {
        const Recast = (await import("recast-detour")).default;
        const recastModule = await Recast();
        this._plugin = new RecastJSPlugin(recastModule);

        // Gather meshes for navmesh baking — only meshes with vertex data
        const navMeshes: Mesh[] = [];
        for (const mesh of this._scene.meshes) {
            const name = mesh.name;
            const isNavMeshSource = NAVMESH_MESH_PREFIXES.some(
                (prefix) => name.startsWith(prefix)
            );
            if (isNavMeshSource && mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
                navMeshes.push(mesh);
            }
        }

        if (navMeshes.length === 0) {
            console.warn("[NavigationManager] No meshes found for navmesh baking.");
            return;
        }

        console.log(`[NavigationManager] Baking navmesh from ${navMeshes.length} meshes...`);
        this._plugin.createNavMesh(navMeshes, NAVMESH_PARAMS);

        // Set query extent after createNavMesh — the navMesh instance is
        // only created inside createNavMesh, so setDefaultQueryExtent
        // must be called afterwards.
        this._plugin.setDefaultQueryExtent(new Vector3(200, 400, 200));
        console.log("[NavigationManager] Navmesh baked successfully.");
    }

    /**
     * Computes a smooth path between two points on the navmesh.
     * @param start - Start position in world space.
     * @param end - End position in world space.
     * @returns Array of waypoints, or empty array if no path exists.
     */
    public computePath(start: Vector3, end: Vector3): Vector3[] {
        if (!this._plugin) return [];
        return this._plugin.computePath(
            this._plugin.getClosestPoint(start),
            this._plugin.getClosestPoint(end),
        );
    }

    /**
     * Returns a random walkable point on the navmesh.
     * Validates the result and retries if Recast returns origin (failure).
     * @param center - Reference position to search around.
     * @param radius - Maximum search radius in cm.
     * @returns A random navmesh point, or a random map position as fallback.
     */
    public getRandomPoint(center: Vector3, radius: number): Vector3 {
        if (!this._plugin) return this._randomFallback();

        // Try multiple times — getRandomPointAround can return (0,0,0) on failure
        for (let attempt = 0; attempt < 5; attempt++) {
            const point = this._plugin.getRandomPointAround(center, radius);
            // Valid if not at exact origin (navmesh is at ground level y≈0, but x/z should vary)
            if (Math.abs(point.x) > 1 || Math.abs(point.z) > 1) {
                return point;
            }
        }

        // Fallback: use getClosestPoint on a random map position
        const fallback = this._randomFallback();
        return this._plugin.getClosestPoint(fallback);
    }

    /**
     * Generates a random position within the map bounds as fallback.
     * @returns A random position at ground level.
     */
    private _randomFallback(): Vector3 {
        const x = (Math.random() - 0.5) * 2400;
        const z = (Math.random() - 0.5) * 2400;
        return new Vector3(x, 0, z);
    }

    /**
     * Snaps a position to the closest point on the navmesh.
     * @param position - Position to snap.
     * @returns Closest navmesh point, or the original position if unavailable.
     */
    public getClosestPoint(position: Vector3): Vector3 {
        if (!this._plugin) return position.clone();
        return this._plugin.getClosestPoint(position);
    }

    /**
     * Creates a debug visualization of the navmesh.
     * @returns The debug mesh, or null if plugin is unavailable.
     */
    public createDebugNavMesh(): Mesh | null {
        if (!this._plugin) return null;
        return this._plugin.createDebugNavMesh(this._scene);
    }

    /**
     * Disposes the navigation plugin.
     */
    public dispose(): void {
        this._plugin = null;
    }
}
