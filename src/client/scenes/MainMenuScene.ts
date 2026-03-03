/**
 * Main menu scene with a 3D background and orbiting camera.
 * Displays the main menu UI overlay on top of the Shipment map.
 * @module client/scenes/MainMenuScene
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import "@babylonjs/core/Meshes/Builders/groundBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";

import { GraphicsSettings } from "../ui/GraphicsSettings";
import { GameScene } from "../core/GameScene";
import { MainMenuUI } from "../ui/MainMenuUI";
import { GameManager } from "../core/GameManager";
import { NetworkManager } from "../network/NetworkManager";
import { MatchScene } from "./MatchScene";
import { LobbyScene } from "./LobbyScene";

/** Map dimensions in cm (matches MatchScene). */
const MAP_SIZE = 3000;

/** Wall height in cm. */
const WALL_HEIGHT = 400;

/** Wall thickness in cm. */
const WALL_THICKNESS = 20;

/** Camera orbit radius in cm. */
const ORBIT_RADIUS = 1800;

/** Camera orbit height in cm. */
const ORBIT_HEIGHT = 600;

/** Camera orbit speed in radians per second. */
const ORBIT_SPEED = 0.1;

/**
 * The main menu scene. Shows the Shipment map with an orbiting camera
 * and a UI overlay with Host/Join/Offline, sensitivity, and quit controls.
 */
export class MainMenuScene extends GameScene {
    private _menuUI: MainMenuUI | null = null;
    private _camera: FreeCamera | null = null;
    private _orbitAngle: number = 0;
    private _shadowGenerator: ShadowGenerator | null = null;
    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;

    /**
     * Initializes the menu scene: map visuals, lighting, camera orbit, and UI.
     */
    public async initialize(): Promise<void> {
        this._scene.clearColor = new Color4(0.53, 0.81, 0.92, 1.0);

        this._buildGround();
        this._buildWalls();
        const shadowGen = this._setupLighting();
        this._shadowGenerator = shadowGen;

        await this._loadMenuProps(shadowGen);

        this._camera = new FreeCamera("camera_menu", Vector3.Zero(), this._scene);
        this._camera.inputs.clear();
        this._camera.minZ = 1;
        this._camera.maxZ = 100000;
        this._scene.activeCamera = this._camera;
        this._setupPostProcessing();

        this._scene.onBeforeRenderObservable.add(() => {
            this._updateOrbit();
        });

        // L toggles ImGui overlay
        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.code === "KeyL") {
                this._manager.imguiManager.toggle();
            }
        };
        window.addEventListener("keydown", this._onKeyDown);

        this._menuUI = new MainMenuUI(
            this._scene,
            (displayName) => this._handleHostGame(displayName),
            (ip, displayName) => this._handleJoinGame(ip, displayName),
            () => this._handlePlayOffline(),
        );
    }

    /**
     * Host Game flow: connect to localhost, create lobby, go to LobbyScene.
     * @param displayName - The player's display name.
     */
    private async _handleHostGame(displayName: string): Promise<void> {
        try {
            this._menuUI?.clearError();
            const network = NetworkManager.getInstance();
            network.connect("localhost");
            await network.createLobby(displayName);
            GameManager.getInstance().loadScene(LobbyScene);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Connection failed";
            this._menuUI?.showError(`Failed to host: ${msg}`);
        }
    }

    /**
     * Join Game flow: connect to IP, join lobby, go to LobbyScene.
     * @param ip - Server IP address.
     * @param displayName - The player's display name.
     */
    private async _handleJoinGame(ip: string, displayName: string): Promise<void> {
        try {
            this._menuUI?.clearError();
            const network = NetworkManager.getInstance();
            network.connect(ip);
            await network.joinLobby(displayName);
            GameManager.getInstance().loadScene(LobbyScene);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Connection failed";
            this._menuUI?.showError(`Failed to join: ${msg}`);
        }
    }

    /**
     * Play Offline flow: load MatchScene directly without networking.
     */
    private _handlePlayOffline(): void {
        GameManager.getInstance().loadScene(MatchScene);
    }

    /**
     * Builds the ground plane with tiled dark prototype texture.
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
    }

    /**
     * Builds four boundary walls around the map.
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
        }
    }

    /**
     * Sets up scene lighting and shadow generator.
     * @returns The shadow generator for registering shadow casters.
     */
    private _setupLighting(): ShadowGenerator {
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

        const shadowGen = new ShadowGenerator(2048, dirLight);
        shadowGen.useBlurExponentialShadowMap = true;
        shadowGen.blurKernel = 16;

        return shadowGen;
    }

    /**
     * Loads a few shipping containers for visual interest in the background.
     * @param shadowGen - The shadow generator to register casters.
     */
    private async _loadMenuProps(shadowGen: ShadowGenerator): Promise<void> {
        const placements = [
            { pos: new Vector3(-600, 0, -600), rotY: 0 },
            { pos: new Vector3(600, 0, 600), rotY: Math.PI / 4 },
            { pos: new Vector3(0, 0, 0), rotY: Math.PI / 6 },
        ];

        for (let i = 0; i < placements.length; i++) {
            const result = await ImportMeshAsync("assets/props/shippingcontainer.glb", this._scene, {});
            const root = result.meshes[0];
            root.name = `prop_container_${i + 1}`;
            root.position = placements[i].pos;
            root.rotationQuaternion = null;
            root.rotation = new Vector3(0, placements[i].rotY, 0);
            root.scaling = new Vector3(100, 100, 100);

            for (const mesh of result.meshes) {
                if (mesh.getTotalVertices() > 0) {
                    (mesh as AbstractMesh).receiveShadows = true;
                    shadowGen.addShadowCaster(mesh as AbstractMesh);
                }
            }
        }
    }

    /**
     * Sets up the post-processing pipeline using persisted GraphicsSettings.
     */
    private _setupPostProcessing(): void {
        const gfx = GraphicsSettings.getInstance();
        const pipeline = gfx.createPipeline(this._scene);

        if (pipeline.grainEnabled) {
            pipeline.grain.animated = true;
        }
    }

    /**
     * Updates the orbiting camera position each frame.
     */
    private _updateOrbit(): void {
        if (!this._camera) return;

        const dt = this._scene.getEngine().getDeltaTime() / 1000;
        this._orbitAngle += ORBIT_SPEED * dt;

        const x = Math.sin(this._orbitAngle) * ORBIT_RADIUS;
        const z = Math.cos(this._orbitAngle) * ORBIT_RADIUS;

        this._camera.position.set(x, ORBIT_HEIGHT, z);
        this._camera.setTarget(Vector3.Zero());
    }

    /**
     * Disposes menu UI and scene resources.
     */
    public override dispose(): void {
        if (this._onKeyDown) {
            window.removeEventListener("keydown", this._onKeyDown);
        }
        this._manager.imguiManager.setDrawCallback(null);
        this._menuUI?.dispose();
        this._shadowGenerator?.dispose();
        GraphicsSettings.getInstance().unbindPipeline();
        super.dispose();
    }
}
