/**
 * Singleton that owns the Babylon.js Engine, loads Havok WASM once,
 * manages scene lifecycle, and runs the render loop.
 * @module client/core/GameManager
 */

import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import HavokPhysics from "@babylonjs/havok";

import type { GameScene } from "./GameScene";
import { ImGuiManager } from "../ui/ImGuiManager";

/** localStorage key for the WebGPU toggle (matches GraphicsSettings prefix + key). */
const GFX_WEBGPU_KEY = "fps_gfx_useWebGPU";

/**
 * Central game manager. Call `GameManager.initialize()` once at startup.
 * Use `loadScene()` to transition between game scenes.
 */
export class GameManager {
    private static _instance: GameManager;

    private _canvas: HTMLCanvasElement;
    private _engine: Engine;
    private _havokInstance: unknown;
    private _activeScene: GameScene | null = null;
    private _imguiManager: ImGuiManager;

    /**
     * Private constructor — use `GameManager.initialize()` instead.
     * @param canvas - The HTML canvas element for rendering.
     * @param engine - The Babylon.js engine instance.
     * @param havokInstance - The initialized Havok WASM instance.
     */
    private constructor(canvas: HTMLCanvasElement, engine: Engine, havokInstance: unknown, imguiManager: ImGuiManager) {
        this._canvas = canvas;
        this._engine = engine;
        this._havokInstance = havokInstance;
        this._imguiManager = imguiManager;
    }

    /**
     * Initializes the GameManager singleton. Creates the Babylon engine,
     * loads Havok WASM, and starts the render loop.
     * @param canvas - The HTML canvas element to render into.
     * @returns The initialized GameManager instance.
     */
    public static async initialize(canvas: HTMLCanvasElement): Promise<GameManager> {
        if (GameManager._instance) {
            return GameManager._instance;
        }

        let engine: Engine;
        const wantWebGPU = localStorage.getItem(GFX_WEBGPU_KEY) === "true";

        if (wantWebGPU && (await WebGPUEngine.IsSupportedAsync)) {
            const gpuEngine = new WebGPUEngine(canvas, {
                stencil: true,
                antialias: true,
                audioEngine: true,
                adaptToDeviceRatio: true,
                powerPreference: "high-performance",
            });
            await gpuEngine.initAsync();
            engine = gpuEngine as unknown as Engine;
            console.log("[GameManager] Using WebGPU engine");
        } else {
            if (wantWebGPU) {
                console.warn("[GameManager] WebGPU not supported — falling back to WebGL");
                localStorage.setItem(GFX_WEBGPU_KEY, "false");
            }
            engine = new Engine(canvas, true, {
                stencil: true,
                antialias: true,
                audioEngine: true,
                adaptToDeviceRatio: true,
                disableWebGL2Support: false,
                useHighPrecisionFloats: true,
                powerPreference: "high-performance",
                failIfMajorPerformanceCaveat: false,
            });
        }

        const havokInstance = await HavokPhysics();

        // Initialize Dear ImGui overlay
        const imguiManager = ImGuiManager.getInstance();
        await imguiManager.initialize(canvas);

        const manager = new GameManager(canvas, engine, havokInstance, imguiManager);
        GameManager._instance = manager;

        window.addEventListener("resize", () => {
            engine.resize();
        });

        engine.runRenderLoop(() => {
            manager._activeScene?.scene.render();
            imguiManager.render();
        });

        return manager;
    }

    /**
     * Returns the singleton instance.
     * @returns The GameManager instance.
     * @throws If `initialize()` has not been called yet.
     */
    public static getInstance(): GameManager {
        if (!GameManager._instance) {
            throw new Error("GameManager has not been initialized. Call GameManager.initialize() first.");
        }
        return GameManager._instance;
    }

    /** The Babylon.js engine. */
    public get engine(): Engine {
        return this._engine;
    }

    /** The initialized Havok WASM instance, shared across scenes. */
    public get havokInstance(): unknown {
        return this._havokInstance;
    }

    /** The HTML canvas element. */
    public get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    /** The currently active game scene, or null. */
    public get activeScene(): GameScene | null {
        return this._activeScene;
    }

    /** The Dear ImGui overlay manager. */
    public get imguiManager(): ImGuiManager {
        return this._imguiManager;
    }

    /**
     * Transitions to a new scene. Disposes the current scene if one exists.
     * @param SceneClass - The GameScene subclass to instantiate and initialize.
     */
    public async loadScene(SceneClass: new (manager: GameManager) => GameScene): Promise<void> {
        if (this._activeScene) {
            this._activeScene.dispose();
            this._activeScene = null;
        }

        // Reset ImGui state between scenes — hide overlay and clear scene-specific callback
        this._imguiManager.hide();
        this._imguiManager.setDrawCallback(null);

        const newScene = new SceneClass(this);
        await newScene.initialize();
        this._activeScene = newScene;
    }

    /**
     * Disposes the engine, active scene, and all resources.
     */
    public dispose(): void {
        this._activeScene?.dispose();
        this._activeScene = null;
        this._imguiManager.dispose();
        this._engine.dispose();
    }
}
