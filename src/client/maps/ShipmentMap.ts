/**
 * Shipment map builder. Constructs the compact shipping yard map
 * with containers, jeeps, barrels, and perimeter fencing.
 * @module client/maps/ShipmentMap
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import "@babylonjs/core/Meshes/Builders/groundBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { MapBuilder } from "./MapBuilder";
import type { MapBuildResult } from "./MapBuilder";

/** Map dimensions in cm (30m × 30m). */
const MAP_SIZE = 3000;

/** Wall height in cm (4m). */
const WALL_HEIGHT = 400;

/** Wall thickness in cm. */
const WALL_THICKNESS = 20;

/**
 * Position and Y-rotation for a single prop instance.
 */
interface PropPlacement {
    /** World-space position. */
    pos: Vector3;
    /** Y-axis rotation in radians. */
    rotY: number;
}

/**
 * Builds the Shipment map — a compact shipping yard with containers,
 * jeeps, barrels, and perimeter fence.
 */
export class ShipmentMap extends MapBuilder {
    private _shadowGenerator: ShadowGenerator | null = null;

    /**
     * Builds the Shipment map into the scene.
     * @returns Spawn points and shadow generator.
     */
    public async build(): Promise<MapBuildResult> {
        this._buildGround();
        this._buildWalls();
        this._setupLighting();
        const spawnPoints = this._createSpawnPoints();
        await this._loadProps();

        return {
            spawnPoints,
            shadowGenerator: this._shadowGenerator,
        };
    }

    /**
     * Builds the ground plane with tiled Kenney Dark prototype texture.
     */
    private _buildGround(): void {
        const ground = MeshBuilder.CreateGround(
            "map_floor",
            { width: MAP_SIZE, height: MAP_SIZE },
            this._scene
        );

        const mat = new StandardMaterial("mat_floor", this._scene);
        const tex = new Texture(
            "assets/textures/prototype/PNG/Dark/texture_01.png",
            this._scene
        );
        tex.uScale = 15;
        tex.vScale = 15;
        mat.diffuseTexture = tex;
        ground.material = mat;
        ground.receiveShadows = true;

        new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
    }

    /**
     * Builds four boundary walls around the map perimeter.
     */
    private _buildWalls(): void {
        const half = MAP_SIZE / 2;
        const wallDefs = [
            { name: "boundary_north", w: MAP_SIZE, d: WALL_THICKNESS, pos: new Vector3(0, WALL_HEIGHT / 2, half) },
            { name: "boundary_south", w: MAP_SIZE, d: WALL_THICKNESS, pos: new Vector3(0, WALL_HEIGHT / 2, -half) },
            { name: "boundary_east", w: WALL_THICKNESS, d: MAP_SIZE, pos: new Vector3(half, WALL_HEIGHT / 2, 0) },
            { name: "boundary_west", w: WALL_THICKNESS, d: MAP_SIZE, pos: new Vector3(-half, WALL_HEIGHT / 2, 0) },
        ];

        for (const def of wallDefs) {
            const wall = MeshBuilder.CreateBox(
                def.name,
                { width: def.w, height: WALL_HEIGHT, depth: def.d },
                this._scene
            );
            wall.position = def.pos;

            const mat = new StandardMaterial(`mat_${def.name}`, this._scene);
            const tex = new Texture(
                "assets/textures/prototype/PNG/Orange/texture_01.png",
                this._scene
            );
            tex.uScale = def.w / 200;
            tex.vScale = WALL_HEIGHT / 200;
            mat.diffuseTexture = tex;
            wall.material = mat;
            wall.receiveShadows = true;
            this._shadowGenerator?.addShadowCaster(wall);

            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
        }
    }

    /**
     * Sets up scene lighting: hemispheric ambient light, directional sun, and shadows.
     */
    private _setupLighting(): void {
        const hemiLight = new HemisphericLight(
            "light_hemispheric_1",
            new Vector3(0, 1, 0),
            this._scene
        );
        hemiLight.intensity = 0.6;

        const dirLight = new DirectionalLight(
            "light_directional_1",
            new Vector3(-1, -2, -1).normalize(),
            this._scene
        );
        dirLight.position = new Vector3(1500, 2000, 1500);
        dirLight.intensity = 0.8;

        this._shadowGenerator = new ShadowGenerator(2048, dirLight);
        this._shadowGenerator.useBlurExponentialShadowMap = true;
        this._shadowGenerator.blurKernel = 16;
    }

    /**
     * Creates spawn point markers at fixed positions around the map.
     * @returns Array of TransformNodes representing spawn locations.
     */
    private _createSpawnPoints(): TransformNode[] {
        const positions: Vector3[] = [
            new Vector3(-1000, 100, -1000),
            new Vector3(1000, 100, -1000),
            new Vector3(-1000, 100, 1000),
            new Vector3(1000, 100, 1000),
            new Vector3(0, 100, 0),
        ];

        return positions.map((pos, i) => {
            const node = new TransformNode(`spawn_point_${i + 1}`, this._scene);
            node.position = pos;
            return node;
        });
    }

    /**
     * Loads all prop GLB models and places them on the map with physics colliders.
     */
    private async _loadProps(): Promise<void> {
        const containerPlacements: PropPlacement[] = [
            { pos: new Vector3(-600, 0, -600), rotY: 0 },
            { pos: new Vector3(600, 0, -600), rotY: Math.PI / 2 },
            { pos: new Vector3(-600, 0, 600), rotY: Math.PI / 2 },
            { pos: new Vector3(600, 0, 600), rotY: 0 },
            { pos: new Vector3(0, 0, 0), rotY: Math.PI / 4 },
        ];
        await this._loadPropInstances("shippingcontainer.glb", "container", containerPlacements);

        const jeepPlacements: PropPlacement[] = [
            { pos: new Vector3(-200, 95, -1200), rotY: Math.PI / 6 },
            { pos: new Vector3(200, 95, 1200), rotY: -Math.PI / 3 },
        ];
        await this._loadPropInstances("jeep.glb", "jeep", jeepPlacements, 100);

        const barrelPlacements: PropPlacement[] = [
            { pos: new Vector3(-400, 0, 0), rotY: 0 },
            { pos: new Vector3(400, 0, 0), rotY: 0 },
            { pos: new Vector3(0, 0, -400), rotY: 0 },
            { pos: new Vector3(0, 0, 400), rotY: 0 },
            { pos: new Vector3(-900, 0, 900), rotY: 0 },
            { pos: new Vector3(900, 0, -900), rotY: 0 },
        ];
        await this._loadPropInstances("barrel_red.glb", "barrel", barrelPlacements, 200);

        const fencePlacements: PropPlacement[] = [
            { pos: new Vector3(-1200, 0, -1480), rotY: 0 },
            { pos: new Vector3(-900, 0, -1480), rotY: 0 },
            { pos: new Vector3(-600, 0, -1480), rotY: 0 },
        ];
        await this._loadPropInstances("fence_piece.glb", "fence", fencePlacements);

        await this._loadPropInstances("fence_end.glb", "fence_end", [
            { pos: new Vector3(-1350, 0, -1480), rotY: 0 },
            { pos: new Vector3(-450, 0, -1480), rotY: Math.PI },
        ]);
    }

    /**
     * Loads a GLB prop file and places multiple instances with physics.
     * @param fileName - GLB filename in public/assets/props/.
     * @param propType - Name prefix for the prop instances.
     * @param placements - Array of position and rotation data.
     * @param scale - Uniform scale factor (default 100).
     */
    private async _loadPropInstances(
        fileName: string,
        propType: string,
        placements: PropPlacement[],
        scale: number = 100
    ): Promise<void> {
        const url = `assets/props/${fileName}`;

        for (let i = 0; i < placements.length; i++) {
            const result = await ImportMeshAsync(url, this._scene, {});
            const root = result.meshes[0];
            root.name = `prop_${propType}_${i + 1}`;
            root.position = placements[i].pos;
            root.rotationQuaternion = null;
            root.rotation = new Vector3(0, placements[i].rotY, 0);
            root.scaling = new Vector3(scale, scale, scale);

            for (const mesh of result.meshes) {
                if (mesh.getTotalVertices() > 0) {
                    new PhysicsAggregate(
                        mesh,
                        PhysicsShapeType.MESH,
                        { mass: 0 },
                        this._scene
                    );
                    (mesh as AbstractMesh).receiveShadows = true;
                    this._shadowGenerator?.addShadowCaster(mesh as AbstractMesh);
                }
            }
        }
    }
}
