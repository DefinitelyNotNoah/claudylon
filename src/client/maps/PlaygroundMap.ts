/**
 * Playground map builder. A large, brightly-lit test environment
 * with ramps, elevated platforms, cover walls, and scattered props.
 * Designed for testing movement, aiming, and weapon feel.
 * @module client/maps/PlaygroundMap
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
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import "@babylonjs/core/Meshes/Builders/groundBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { MapBuilder } from "./MapBuilder";
import type { MapBuildResult } from "./MapBuilder";

/** Playground dimensions in cm (50m × 50m). */
const MAP_SIZE = 5000;

/** Boundary wall height in cm. */
const WALL_HEIGHT = 500;

/** Boundary wall thickness in cm. */
const WALL_THICKNESS = 20;

/** Ramp/platform step depth for ramp slope construction. */
const RAMP_SLOPE_DEPTH = 400;

/**
 * Builds the Playground map — a spacious, well-lit test environment.
 */
export class PlaygroundMap extends MapBuilder {
    private _shadowGenerator: ShadowGenerator | null = null;

    /**
     * Builds the Playground map into the scene.
     * @returns Spawn points and shadow generator.
     */
    public async build(): Promise<MapBuildResult> {
        this._setupLighting();
        this._buildGround();
        this._buildBoundaryWalls();
        this._buildPlatforms();
        this._buildRamps();
        this._buildCoverWalls();
        await this._loadProps();
        const spawnPoints = this._createSpawnPoints();

        return {
            spawnPoints,
            shadowGenerator: this._shadowGenerator,
        };
    }

    /**
     * Sets up bright lighting suited to an outdoor test environment.
     * Stronger ambient and directional than Shipment.
     */
    private _setupLighting(): void {
        const hemi = new HemisphericLight(
            "light_hemispheric_1",
            new Vector3(0, 1, 0),
            this._scene
        );
        hemi.intensity = 0.9;
        hemi.diffuse = new Color3(1.0, 1.0, 1.0);
        hemi.groundColor = new Color3(0.4, 0.4, 0.4);

        const sun = new DirectionalLight(
            "light_directional_1",
            new Vector3(-1, -2, -0.5).normalize(),
            this._scene
        );
        sun.position = new Vector3(2000, 3000, 2000);
        sun.intensity = 1.1;

        this._shadowGenerator = new ShadowGenerator(2048, sun);
        this._shadowGenerator.useBlurExponentialShadowMap = true;
        this._shadowGenerator.blurKernel = 16;
    }

    /**
     * Builds the large ground plane with tiled Green prototype texture.
     */
    private _buildGround(): void {
        const ground = MeshBuilder.CreateGround(
            "map_floor",
            { width: MAP_SIZE, height: MAP_SIZE },
            this._scene
        );

        const mat = new StandardMaterial("mat_floor", this._scene);
        const tex = new Texture(
            "assets/textures/prototype/PNG/Green/texture_01.png",
            this._scene
        );
        tex.uScale = 25;
        tex.vScale = 25;
        mat.diffuseTexture = tex;
        ground.material = mat;
        ground.receiveShadows = true;

        new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
    }

    /**
     * Builds four solid boundary walls around the map perimeter.
     */
    private _buildBoundaryWalls(): void {
        const half = MAP_SIZE / 2;
        const wallDefs = [
            { name: "boundary_north", w: MAP_SIZE + WALL_THICKNESS * 2, d: WALL_THICKNESS, pos: new Vector3(0, WALL_HEIGHT / 2, half) },
            { name: "boundary_south", w: MAP_SIZE + WALL_THICKNESS * 2, d: WALL_THICKNESS, pos: new Vector3(0, WALL_HEIGHT / 2, -half) },
            { name: "boundary_east",  w: WALL_THICKNESS, d: MAP_SIZE, pos: new Vector3(half, WALL_HEIGHT / 2, 0) },
            { name: "boundary_west",  w: WALL_THICKNESS, d: MAP_SIZE, pos: new Vector3(-half, WALL_HEIGHT / 2, 0) },
        ];

        const mat = new StandardMaterial("mat_boundary", this._scene);
        const tex = new Texture(
            "assets/textures/prototype/PNG/Purple/texture_01.png",
            this._scene
        );
        tex.uScale = 5;
        tex.vScale = 5;
        mat.diffuseTexture = tex;

        for (const def of wallDefs) {
            const wall = MeshBuilder.CreateBox(
                def.name,
                { width: def.w, height: WALL_HEIGHT, depth: def.d },
                this._scene
            );
            wall.position = def.pos;
            wall.material = mat;
            wall.receiveShadows = true;
            this._shadowGenerator?.addShadowCaster(wall);
            new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
        }
    }

    /**
     * Builds elevated platform slabs at various heights.
     * Uses Light prototype texture so they visually stand out from the ground.
     */
    private _buildPlatforms(): void {
        const mat = new StandardMaterial("mat_platform", this._scene);
        const tex = new Texture(
            "assets/textures/prototype/PNG/Light/texture_01.png",
            this._scene
        );
        tex.uScale = 4;
        tex.vScale = 4;
        mat.diffuseTexture = tex;

        /** Platform definitions: position (centre bottom), width, depth, height. */
        const platforms: Array<{ name: string; x: number; z: number; w: number; d: number; h: number }> = [
            // Low platform — left side
            { name: "map_platform_low_left",   x: -1500, z:  500, w: 600, d: 400, h: 120 },
            // Low platform — right side
            { name: "map_platform_low_right",  x:  1500, z: -500, w: 600, d: 400, h: 120 },
            // Mid platform — centre-north
            { name: "map_platform_mid_north",  x:     0, z: 1400, w: 800, d: 500, h: 240 },
            // Mid platform — centre-south
            { name: "map_platform_mid_south",  x:     0, z: -1400, w: 800, d: 500, h: 240 },
            // Tall sniper tower — far north-west
            { name: "map_platform_tower_nw",   x: -1800, z: 1800, w: 400, d: 400, h: 420 },
            // Tall sniper tower — far south-east
            { name: "map_platform_tower_se",   x:  1800, z: -1800, w: 400, d: 400, h: 420 },
        ];

        for (const p of platforms) {
            const mesh = MeshBuilder.CreateBox(
                p.name,
                { width: p.w, height: p.h, depth: p.d },
                this._scene
            );
            mesh.position = new Vector3(p.x, p.h / 2, p.z);
            mesh.material = mat;
            mesh.receiveShadows = true;
            this._shadowGenerator?.addShadowCaster(mesh);
            new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
        }
    }

    /**
     * Builds ramp geometry using stacked thin boxes to approximate a slope.
     * Ramps connect ground to the mid-height platforms.
     */
    private _buildRamps(): void {
        const mat = new StandardMaterial("mat_ramp", this._scene);
        const tex = new Texture(
            "assets/textures/prototype/PNG/Orange/texture_01.png",
            this._scene
        );
        tex.uScale = 3;
        tex.vScale = 3;
        mat.diffuseTexture = tex;

        /**
         * Builds a single ramp as a rotated box.
         * @param name - Mesh name.
         * @param cx - Centre X position.
         * @param cy - Centre Y position.
         * @param cz - Centre Z position.
         * @param width - Ramp width (side-to-side).
         * @param length - Ramp run length.
         * @param angleRad - Pitch angle in radians (positive = rises toward +Z).
         * @param rotY - Yaw rotation in radians.
         */
        const buildRamp = (
            name: string,
            cx: number, cy: number, cz: number,
            width: number, length: number, thickness: number,
            angleRad: number, rotY: number
        ): void => {
            const ramp = MeshBuilder.CreateBox(
                name,
                { width, height: thickness, depth: length },
                this._scene
            ) as Mesh;
            ramp.position = new Vector3(cx, cy, cz);
            ramp.rotation = new Vector3(angleRad, rotY, 0);
            ramp.material = mat;
            ramp.receiveShadows = true;
            this._shadowGenerator?.addShadowCaster(ramp);
            new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
        };

        // Ramps up to the mid-north platform (h=240, depth=500)
        // Platform front edge is at z=1400 - 250 = z=1150; ramp spans from z=850 to z=1150.
        const rampAngleNorth = Math.atan2(240, RAMP_SLOPE_DEPTH);
        buildRamp("map_ramp_north_west",
            -200, 120, 950,
            250, RAMP_SLOPE_DEPTH + 60, 30,
            -rampAngleNorth, 0
        );
        buildRamp("map_ramp_north_east",
             200, 120, 950,
            250, RAMP_SLOPE_DEPTH + 60, 30,
            -rampAngleNorth, 0
        );

        // Ramps up to mid-south platform (z=-1400)
        buildRamp("map_ramp_south_west",
            -200, 120, -950,
            250, RAMP_SLOPE_DEPTH + 60, 30,
            rampAngleNorth, 0
        );
        buildRamp("map_ramp_south_east",
             200, 120, -950,
            250, RAMP_SLOPE_DEPTH + 60, 30,
            rampAngleNorth, 0
        );
    }

    /**
     * Builds short cover walls scattered around the arena.
     * Uses Dark prototype texture to contrast with the ground.
     */
    private _buildCoverWalls(): void {
        const mat = new StandardMaterial("mat_cover", this._scene);
        const tex = new Texture(
            "assets/textures/prototype/PNG/Dark/texture_01.png",
            this._scene
        );
        tex.uScale = 3;
        tex.vScale = 2;
        mat.diffuseTexture = tex;

        /** Cover wall definitions: position, width, depth, height, yaw. */
        const covers: Array<{ name: string; x: number; z: number; w: number; d: number; h: number; rotY?: number }> = [
            // Central cross cover
            { name: "map_cover_center_ns", x:    0, z:   0, w:  40, d: 400, h: 150 },
            { name: "map_cover_center_ew", x:    0, z:   0, w: 400, d:  40, h: 150 },

            // North-west cluster
            { name: "map_cover_nw_1", x: -800, z:  800, w: 300, d:  40, h: 130 },
            { name: "map_cover_nw_2", x: -600, z:  600, w:  40, d: 200, h: 130 },

            // South-east cluster
            { name: "map_cover_se_1", x:  800, z: -800, w: 300, d:  40, h: 130 },
            { name: "map_cover_se_2", x:  600, z: -600, w:  40, d: 200, h: 130 },

            // North-east L-shape
            { name: "map_cover_ne_1", x:  900, z:  900, w: 250, d:  40, h: 140 },
            { name: "map_cover_ne_2", x: 1025, z: 1025, w:  40, d: 210, h: 140 },

            // South-west L-shape
            { name: "map_cover_sw_1", x: -900, z: -900, w: 250, d:  40, h: 140 },
            { name: "map_cover_sw_2", x: -1025, z: -1025, w:  40, d: 210, h: 140 },
        ];

        for (const c of covers) {
            const mesh = MeshBuilder.CreateBox(
                c.name,
                { width: c.w, height: c.h, depth: c.d },
                this._scene
            );
            mesh.position = new Vector3(c.x, c.h / 2, c.z);
            if (c.rotY) {
                mesh.rotation.y = c.rotY;
            }
            mesh.material = mat;
            mesh.receiveShadows = true;
            this._shadowGenerator?.addShadowCaster(mesh);
            new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0 }, this._scene);
        }
    }

    /**
     * Loads scattered barrel and container props for additional cover.
     */
    private async _loadProps(): Promise<void> {
        const barrelPositions: Array<{ pos: Vector3; rotY: number }> = [
            { pos: new Vector3(-300, 0, -300), rotY: 0 },
            { pos: new Vector3( 300, 0,  300), rotY: 0.5 },
            { pos: new Vector3(-300, 0,  300), rotY: 1.0 },
            { pos: new Vector3( 300, 0, -300), rotY: 1.5 },
            { pos: new Vector3(-1200, 0,    0), rotY: 0 },
            { pos: new Vector3( 1200, 0,    0), rotY: 0 },
            { pos: new Vector3(    0, 0, -1200), rotY: 0.8 },
            { pos: new Vector3(    0, 0,  1200), rotY: 0.8 },
        ];

        const url = "assets/props/barrel_red.glb";
        for (let i = 0; i < barrelPositions.length; i++) {
            const p = barrelPositions[i];
            const result = await ImportMeshAsync(url, this._scene, {});
            const root = result.meshes[0];
            root.name = `prop_barrel_${i + 1}`;
            root.position = p.pos;
            root.rotationQuaternion = null;
            root.rotation = new Vector3(0, p.rotY, 0);
            root.scaling = new Vector3(200, 200, 200);

            for (const mesh of result.meshes) {
                if (mesh.getTotalVertices() > 0) {
                    new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, this._scene);
                    (mesh as AbstractMesh).receiveShadows = true;
                    this._shadowGenerator?.addShadowCaster(mesh as AbstractMesh);
                }
            }
        }

        // A couple containers at the edges for long-range cover reference
        const containerPositions: Array<{ pos: Vector3; rotY: number }> = [
            { pos: new Vector3(-1800, 0,    0), rotY: Math.PI / 2 },
            { pos: new Vector3( 1800, 0,    0), rotY: Math.PI / 2 },
        ];

        const containerUrl = "assets/props/shippingcontainer.glb";
        for (let i = 0; i < containerPositions.length; i++) {
            const p = containerPositions[i];
            const result = await ImportMeshAsync(containerUrl, this._scene, {});
            const root = result.meshes[0];
            root.name = `prop_container_${i + 1}`;
            root.position = p.pos;
            root.rotationQuaternion = null;
            root.rotation = new Vector3(0, p.rotY, 0);
            root.scaling = new Vector3(100, 100, 100);

            for (const mesh of result.meshes) {
                if (mesh.getTotalVertices() > 0) {
                    new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, this._scene);
                    (mesh as AbstractMesh).receiveShadows = true;
                    this._shadowGenerator?.addShadowCaster(mesh as AbstractMesh);
                }
            }
        }
    }

    /**
     * Creates 8 spawn points spread around the map.
     * @returns Array of TransformNodes at spawn locations.
     */
    private _createSpawnPoints(): TransformNode[] {
        const positions: Vector3[] = [
            // Four corners
            new Vector3(-1800, 100, -1800),
            new Vector3( 1800, 100, -1800),
            new Vector3(-1800, 100,  1800),
            new Vector3( 1800, 100,  1800),
            // Cardinal mid-edges
            new Vector3(    0, 100, -2000),
            new Vector3(    0, 100,  2000),
            new Vector3(-2000, 100,     0),
            new Vector3( 2000, 100,     0),
        ];

        return positions.map((pos, i) => {
            const node = new TransformNode(`spawn_point_${i + 1}`, this._scene);
            node.position = pos;
            return node;
        });
    }
}
