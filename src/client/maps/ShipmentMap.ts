/**
 * Shipment map builder. Constructs the compact shipping yard map
 * with containers arranged in rows, jeeps, barrels, and perimeter fencing.
 *
 * Layout overview (top-down, X = east, Z = north):
 *
 *   N boundary  ──────────────────────────────────
 *   fence row   [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]
 *   N container  [C] [C] [C]   [C] [C] [C]
 *   open lane   ─────────────────────────────────
 *   mid row      [C] [C]   [C][C]   [C] [C]
 *   open lane   ─────────────────────────────────
 *   S container  [C] [C] [C]   [C] [C] [C]
 *   fence row   [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]
 *   S boundary  ──────────────────────────────────
 *
 * Spawn points are placed in the four corners and two mid-side pockets
 * to give initial cover before pushing into the container lanes.
 *
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
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

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
 * Builds the Shipment map — a compact shipping yard with containers arranged
 * in parallel east-west rows, flanking alleys, barrel clusters, and perimeter fence.
 */
export class ShipmentMap extends MapBuilder {
    private _shadowGenerator: ShadowGenerator | null = null;

    /**
     * Builds the Shipment map into the scene.
     * @returns Spawn points and shadow generator.
     */
    public async build(): Promise<MapBuildResult> {
        this._setupLighting();
        this._buildGround();
        this._buildWalls();
        const spawnPoints = this._createSpawnPoints();
        await this._loadProps();

        return {
            spawnPoints,
            shadowGenerator: this._shadowGenerator,
        };
    }

    /**
     * Sets up scene lighting: warm hemispheric ambient, angled directional sun, and soft shadows.
     */
    private _setupLighting(): void {
        const hemi = new HemisphericLight(
            "light_hemispheric_1",
            new Vector3(0, 1, 0),
            this._scene
        );
        hemi.intensity = 0.55;
        hemi.diffuse = new Color3(1.0, 0.97, 0.88);        // warm daylight
        hemi.groundColor = new Color3(0.35, 0.30, 0.25);   // warm ground bounce

        // Directional sun from the north-west at a low angle — creates nice long shadows
        // through the container alleys.
        const sun = new DirectionalLight(
            "light_directional_1",
            new Vector3(-0.6, -1.5, -0.4).normalize(),
            this._scene
        );
        sun.position = new Vector3(1200, 2500, 1200);
        sun.intensity = 1.0;
        sun.diffuse = new Color3(1.0, 0.95, 0.80);   // warm yellow sun
        sun.specular = new Color3(0.5, 0.48, 0.40);

        this._shadowGenerator = new ShadowGenerator(2048, sun);
        this._shadowGenerator.useBlurExponentialShadowMap = true;
        this._shadowGenerator.blurKernel = 24;
        this._shadowGenerator.darkness = 0.35;  // softer shadows (0 = full black, 1 = no shadow)

        // Overcast midday sky — slightly grey-blue, matches the gritty shipyard feel
        this._scene.clearColor = new Color4(0.62, 0.68, 0.75, 1.0);

        // Very subtle atmospheric haze — just enough depth cue, not enough to obscure gameplay
        this._scene.fogMode = 3; // FOGMODE_EXP2
        this._scene.fogDensity = 0.000008;
        this._scene.fogColor = new Color3(0.70, 0.74, 0.80);
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
            { name: "boundary_east",  w: WALL_THICKNESS, d: MAP_SIZE, pos: new Vector3(half, WALL_HEIGHT / 2, 0) },
            { name: "boundary_west",  w: WALL_THICKNESS, d: MAP_SIZE, pos: new Vector3(-half, WALL_HEIGHT / 2, 0) },
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
     * Creates 6 spawn point markers spread to corners and mid-sides with initial cover.
     * @returns Array of TransformNodes representing spawn locations.
     */
    private _createSpawnPoints(): TransformNode[] {
        const positions: Vector3[] = [
            // Four corners — behind the outer fence row
            new Vector3(-1200, 100, -1200),
            new Vector3( 1200, 100, -1200),
            new Vector3(-1200, 100,  1200),
            new Vector3( 1200, 100,  1200),
            // Mid-west and mid-east pockets — between fence and container rows
            new Vector3(-1350, 100,    0),
            new Vector3( 1350, 100,    0),
        ];

        return positions.map((pos, i) => {
            const node = new TransformNode(`spawn_point_${i + 1}`, this._scene);
            node.position = pos;
            return node;
        });
    }

    /**
     * Loads all prop GLB models and places them on the map with physics colliders.
     *
     * Container layout strategy:
     *   - North row: 3+3 containers (east/west halves) at Z=+750, forming east-west cover
     *   - South row: 3+3 containers at Z=-750, mirroring north row
     *   - Mid row: 2+2+2 containers at Z=0 with gaps for cross-lane movement
     *   - Stacked containers at Z=±750 for high cover / sniper angles
     *
     * Alleys run east-west between rows; flanking corridors run north-south at X=±500.
     */
    private async _loadProps(): Promise<void> {
        // ----------------------------------------------------------------
        // SHIPPING CONTAINERS
        // Container GLB is ~6m long × ~2.5m wide × ~2.5m tall at scale=100
        // So at scale 100: ~600 cm long, ~250 cm wide, ~250 cm tall
        // ----------------------------------------------------------------

        // North container row — Z=+750
        // Three on the west half, three on the east half, gap in the middle at X=0
        const northRowContainers: PropPlacement[] = [
            // West group — three E-W aligned containers
            { pos: new Vector3(-1100, 0, 750), rotY: 0 },
            { pos: new Vector3( -500, 0, 750), rotY: 0 },
            { pos: new Vector3(  100, 0, 750), rotY: 0 },
            // East group — three E-W aligned containers
            { pos: new Vector3( 1100, 0, 750), rotY: 0 },
            { pos: new Vector3(  500, 0, 750), rotY: 0 },
            { pos: new Vector3(  -100, 0, 750), rotY: 0 },
        ];

        // South container row — mirrored at Z=-750
        const southRowContainers: PropPlacement[] = [
            { pos: new Vector3(-1100, 0, -750), rotY: 0 },
            { pos: new Vector3( -500, 0, -750), rotY: 0 },
            { pos: new Vector3(  100, 0, -750), rotY: 0 },
            { pos: new Vector3( 1100, 0, -750), rotY: 0 },
            { pos: new Vector3(  500, 0, -750), rotY: 0 },
            { pos: new Vector3(  -100, 0, -750), rotY: 0 },
        ];

        // Mid row — Z=0, rotated N-S to create perpendicular cover across the center lane
        // These block the main sightlines and force players into the gaps
        const midRowContainers: PropPlacement[] = [
            // West cluster — N-S oriented, blocking west alley sightline
            { pos: new Vector3(-900, 0, 0), rotY: Math.PI / 2 },
            { pos: new Vector3(-300, 0, 0), rotY: Math.PI / 2 },
            // East cluster — N-S oriented
            { pos: new Vector3( 300, 0, 0), rotY: Math.PI / 2 },
            { pos: new Vector3( 900, 0, 0), rotY: Math.PI / 2 },
        ];

        // Stacked container on top of north row to create sniper/elevated position
        // Placed at scale 100 (same as others), Y offset = ~250 cm (height of one container)
        const stackedContainers: PropPlacement[] = [
            { pos: new Vector3(-1100, 250, 750), rotY: 0 },   // north-west stack
            { pos: new Vector3( 1100, 250, -750), rotY: 0 },  // south-east stack
        ];

        const allContainerPlacements = [
            ...northRowContainers,
            ...southRowContainers,
            ...midRowContainers,
            ...stackedContainers,
        ];

        await this._loadPropInstances("shippingcontainer.glb", "container", allContainerPlacements);

        // ----------------------------------------------------------------
        // JEEPS — placed in the east and west alley mid-points as cover
        // ----------------------------------------------------------------
        const jeepPlacements: PropPlacement[] = [
            { pos: new Vector3(-1350, 95, 300), rotY: Math.PI / 2 },   // west alley, north
            { pos: new Vector3( 1350, 95, -300), rotY: -Math.PI / 2 }, // east alley, south
        ];
        await this._loadPropInstances("jeep.glb", "jeep", jeepPlacements, 100);

        // ----------------------------------------------------------------
        // BARRELS — clustered at alley junctions and spawn approach zones
        // Barrels at scale 200 are ~40cm radius, ~80cm tall — crouch/peek cover
        // ----------------------------------------------------------------
        const barrelPlacements: PropPlacement[] = [
            // North-west spawn approach cluster
            { pos: new Vector3(-1200,  0, 350), rotY: 0 },
            { pos: new Vector3(-1050,  0, 350), rotY: 0.8 },
            // South-east spawn approach cluster
            { pos: new Vector3( 1200,  0, -350), rotY: 0 },
            { pos: new Vector3( 1050,  0, -350), rotY: 1.2 },
            // Center lane junction barrels — quick micro-cover when crossing
            { pos: new Vector3(    0,  0,  300), rotY: 0 },
            { pos: new Vector3(    0,  0, -300), rotY: 0.5 },
            // East alley north end
            { pos: new Vector3( 1350,  0,  800), rotY: 0.3 },
            // West alley south end
            { pos: new Vector3(-1350,  0, -800), rotY: 1.0 },
        ];
        await this._loadPropInstances("barrel_red.glb", "barrel", barrelPlacements, 200);

        // ----------------------------------------------------------------
        // FENCES — perimeter fence rows along north and south boundary, sealing
        // the outer corridor to funnel players inward through container gaps.
        // fence_piece is ~3m wide, fence_end caps the row.
        // At default scale (no extra scale), fence_piece ≈ 300 cm wide.
        // ----------------------------------------------------------------

        // North fence row — at Z=+1350 (between N container row and N boundary wall)
        const northFencePlacements: PropPlacement[] = [
            { pos: new Vector3(-1350, 0, 1350), rotY: 0 },
            { pos: new Vector3(-1050, 0, 1350), rotY: 0 },
            { pos: new Vector3( -750, 0, 1350), rotY: 0 },
            { pos: new Vector3( -450, 0, 1350), rotY: 0 },
            { pos: new Vector3( -150, 0, 1350), rotY: 0 },
            { pos: new Vector3(  150, 0, 1350), rotY: 0 },
            { pos: new Vector3(  450, 0, 1350), rotY: 0 },
            { pos: new Vector3(  750, 0, 1350), rotY: 0 },
            { pos: new Vector3( 1050, 0, 1350), rotY: 0 },
            { pos: new Vector3( 1350, 0, 1350), rotY: 0 },
        ];

        // South fence row — at Z=-1350
        const southFencePlacements: PropPlacement[] = northFencePlacements.map(p => ({
            pos: new Vector3(p.pos.x, 0, -1350),
            rotY: 0,
        }));

        await this._loadPropInstances("fence_piece.glb", "fence_n", northFencePlacements);
        await this._loadPropInstances("fence_piece.glb", "fence_s", southFencePlacements);

        // Fence end caps
        await this._loadPropInstances("fence_end.glb", "fence_end", [
            { pos: new Vector3(-1480, 0,  1350), rotY: 0 },
            { pos: new Vector3( 1480, 0,  1350), rotY: Math.PI },
            { pos: new Vector3(-1480, 0, -1350), rotY: 0 },
            { pos: new Vector3( 1480, 0, -1350), rotY: Math.PI },
        ]);
    }

    /**
     * Loads a GLB prop file and places multiple instances with physics and shadows.
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
