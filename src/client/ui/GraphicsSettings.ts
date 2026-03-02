/**
 * Manages graphics pipeline settings with localStorage persistence.
 * All settings are loaded on construction and applied to a DefaultRenderingPipeline.
 * @module client/ui/GraphicsSettings
 */

import { Scene } from "@babylonjs/core/scene";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { GameManager } from "../core/GameManager";

/** localStorage prefix for all graphics settings. */
const GFX_PREFIX = "fps_gfx_";

/**
 * Descriptor for a single graphics setting.
 */
export interface GraphicsSettingDescriptor {
    /** Setting key (without prefix). */
    key: string;
    /** Human-readable label for the UI. */
    label: string;
    /** Setting type: number slider or boolean toggle. */
    type: "number" | "boolean";
    /** Default value. */
    defaultValue: number | boolean;
    /** Minimum value (number only). */
    min?: number;
    /** Maximum value (number only). */
    max?: number;
    /** Step size for slider (number only). */
    step?: number;
    /** Category grouping for the UI. */
    category: "rendering" | "antialiasing" | "bloom" | "imageProcessing" | "effects";
}

/** Valid MSAA sample counts (must be powers of 2). */
const VALID_MSAA_SAMPLES = [1, 2, 4, 8];

/**
 * Keys whose changes require a full pipeline rebuild to avoid GPU resource leaks.
 * Changing MSAA samples or toggling bloom/sharpen/grain allocates render targets
 * that Babylon.js doesn't fully release when the values are lowered or disabled.
 */
const REBUILD_KEYS = new Set([
    "msaaSamples",
    "fxaaEnabled",
    "bloomEnabled",
    "sharpenEnabled",
    "grainEnabled",
]);

/** Keys that require a page reload instead of live pipeline update. */
const RELOAD_KEYS = new Set(["useWebGPU"]);

/** All available graphics settings with their metadata. */
export const GRAPHICS_SETTINGS_DESCRIPTORS: GraphicsSettingDescriptor[] = [
    // ─── Rendering ───────────────────────────────────────────────
    {
        key: "useWebGPU",
        label: "WebGPU",
        type: "boolean",
        defaultValue: false,
        category: "rendering",
    },
    {
        key: "renderScale",
        label: "Render Scale",
        type: "number",
        defaultValue: 100,
        min: 25,
        max: 100,
        step: 5,
        category: "rendering",
    },

    // ─── Anti-Aliasing ────────────────────────────────────────────
    {
        key: "msaaSamples",
        label: "MSAA Samples",
        type: "number",
        defaultValue: 8,
        min: 1,
        max: 8,
        step: 1,
        category: "antialiasing",
    },
    {
        key: "fxaaEnabled",
        label: "FXAA",
        type: "boolean",
        defaultValue: true,
        category: "antialiasing",
    },

    // ─── Bloom ────────────────────────────────────────────────────
    {
        key: "bloomEnabled",
        label: "Bloom",
        type: "boolean",
        defaultValue: true,
        category: "bloom",
    },
    {
        key: "bloomThreshold",
        label: "Bloom Threshold",
        type: "number",
        defaultValue: 0.9,
        min: 0,
        max: 2,
        step: 0.05,
        category: "bloom",
    },
    {
        key: "bloomWeight",
        label: "Bloom Intensity",
        type: "number",
        defaultValue: 0.05,
        min: 0,
        max: 1,
        step: 0.05,
        category: "bloom",
    },
    {
        key: "bloomKernel",
        label: "Bloom Kernel",
        type: "number",
        defaultValue: 16,
        min: 16,
        max: 128,
        step: 16,
        category: "bloom",
    },
    {
        key: "bloomScale",
        label: "Bloom Scale",
        type: "number",
        defaultValue: 0.4,
        min: 0.1,
        max: 1,
        step: 0.1,
        category: "bloom",
    },

    // ─── Image Processing ─────────────────────────────────────────
    {
        key: "toneMappingEnabled",
        label: "Tone Mapping",
        type: "boolean",
        defaultValue: true,
        category: "imageProcessing",
    },
    {
        key: "toneMappingType",
        label: "Tone Map Type (0=Standard, 1=ACES)",
        type: "number",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 1,
        category: "imageProcessing",
    },
    {
        key: "exposure",
        label: "Exposure",
        type: "number",
        defaultValue: 1.0,
        min: 0.5,
        max: 3,
        step: 0.1,
        category: "imageProcessing",
    },
    {
        key: "contrast",
        label: "Contrast",
        type: "number",
        defaultValue: 1.0,
        min: 0.5,
        max: 2,
        step: 0.05,
        category: "imageProcessing",
    },

    // ─── Effects ──────────────────────────────────────────────────
    {
        key: "sharpenEnabled",
        label: "Sharpen",
        type: "boolean",
        defaultValue: true,
        category: "effects",
    },
    {
        key: "sharpenAmount",
        label: "Sharpen Amount",
        type: "number",
        defaultValue: 0.3,
        min: 0,
        max: 1,
        step: 0.05,
        category: "effects",
    },
    {
        key: "grainEnabled",
        label: "Film Grain",
        type: "boolean",
        defaultValue: true,
        category: "effects",
    },
    {
        key: "grainIntensity",
        label: "Grain Intensity",
        type: "number",
        defaultValue: 3,
        min: 0,
        max: 30,
        step: 1,
        category: "effects",
    },
];

/**
 * Manages graphics rendering settings with localStorage persistence.
 * Loads saved values on construction, provides get/set accessors,
 * and can apply all settings to a DefaultRenderingPipeline.
 */
export class GraphicsSettings {
    private static _instance: GraphicsSettings | null = null;

    private _values: Map<string, number | boolean> = new Map();

    /** Pipeline reference for live updates. */
    private _pipeline: DefaultRenderingPipeline | null = null;

    /** Scene reference for image processing config. */
    private _scene: Scene | null = null;

    /**
     * Private constructor — use getInstance().
     */
    private constructor() {
        this._loadFromStorage();
    }

    /**
     * Returns the singleton instance.
     * @returns The GraphicsSettings singleton.
     */
    public static getInstance(): GraphicsSettings {
        if (!GraphicsSettings._instance) {
            GraphicsSettings._instance = new GraphicsSettings();
        }
        return GraphicsSettings._instance;
    }

    /**
     * Loads all settings from localStorage, falling back to defaults.
     */
    private _loadFromStorage(): void {
        for (const desc of GRAPHICS_SETTINGS_DESCRIPTORS) {
            const stored = localStorage.getItem(GFX_PREFIX + desc.key);
            if (stored !== null) {
                if (desc.type === "boolean") {
                    this._values.set(desc.key, stored === "true");
                } else {
                    this._values.set(desc.key, parseFloat(stored));
                }
            } else {
                this._values.set(desc.key, desc.defaultValue);
            }
        }
    }

    /**
     * Gets a setting value.
     * @param key - The setting key.
     * @returns The current value.
     */
    public get(key: string): number | boolean {
        const val = this._values.get(key);
        if (val !== undefined) return val;
        const desc = GRAPHICS_SETTINGS_DESCRIPTORS.find((d) => d.key === key);
        return desc ? desc.defaultValue : 0;
    }

    /**
     * Sets a setting value, persists to localStorage, and applies live if pipeline is bound.
     * For settings that allocate GPU resources (MSAA, bloom toggle, etc.), the entire
     * pipeline is disposed and recreated to prevent render target leaks.
     * @param key - The setting key.
     * @param value - The new value.
     */
    public set(key: string, value: number | boolean): void {
        this._values.set(key, value);
        localStorage.setItem(GFX_PREFIX + key, String(value));

        // Settings that require a full page reload (e.g. graphics API change)
        if (RELOAD_KEYS.has(key)) {
            const reload = confirm("Switching graphics API requires a page reload. Reload now?");
            if (reload) {
                location.reload();
            }
            return;
        }

        if (REBUILD_KEYS.has(key) && this._pipeline && this._scene) {
            this._rebuildPipeline();
        } else {
            this._applySettingLive(key);
        }
    }

    /**
     * Resets all settings to their defaults and rebuilds the pipeline.
     */
    public resetToDefaults(): void {
        // Check if a reload-requiring setting is changing from non-default
        let needsReload = false;
        for (const key of RELOAD_KEYS) {
            const current = this._values.get(key);
            const desc = GRAPHICS_SETTINGS_DESCRIPTORS.find((d) => d.key === key);
            if (desc && current !== desc.defaultValue) {
                needsReload = true;
            }
        }

        for (const desc of GRAPHICS_SETTINGS_DESCRIPTORS) {
            this._values.set(desc.key, desc.defaultValue);
            localStorage.removeItem(GFX_PREFIX + desc.key);
        }

        if (needsReload) {
            const reload = confirm("Resetting graphics API requires a page reload. Reload now?");
            if (reload) {
                location.reload();
            }
            return;
        }

        if (this._pipeline && this._scene) {
            this._rebuildPipeline();
        } else {
            this._applyAllLive();
        }
    }

    /**
     * Binds a pipeline and scene for live updates.
     * @param pipeline - The DefaultRenderingPipeline to control.
     * @param scene - The Babylon scene (for image processing config).
     */
    public bindPipeline(pipeline: DefaultRenderingPipeline, scene: Scene): void {
        this._pipeline = pipeline;
        this._scene = scene;
        this._applyAllLive();
    }

    /**
     * Unbinds the pipeline (e.g. on scene dispose).
     */
    public unbindPipeline(): void {
        this._pipeline = null;
        this._scene = null;
    }

    /**
     * Disposes the current pipeline and creates a fresh one with all current settings.
     * This ensures GPU render targets from previous configurations are fully released.
     */
    private _rebuildPipeline(): void {
        const scene = this._scene;
        if (!scene) return;

        // Dispose old pipeline completely
        if (this._pipeline) {
            this._pipeline.dispose();
            this._pipeline = null;
        }

        // Create fresh pipeline
        this.createPipeline(scene);
    }

    /**
     * Applies all current settings to the bound pipeline.
     */
    private _applyAllLive(): void {
        for (const desc of GRAPHICS_SETTINGS_DESCRIPTORS) {
            this._applySettingLive(desc.key);
        }
    }

    /**
     * Applies a single setting to the bound pipeline.
     * @param key - The setting key.
     */
    private _applySettingLive(key: string): void {
        const p = this._pipeline;
        const s = this._scene;
        if (!p) return;

        const val = this.get(key);

        switch (key) {
            // Rendering — adjusts hardware scaling level
            case "renderScale": {
                try {
                    const engine = GameManager.getInstance().engine;
                    const baseScale = 1.0 / window.devicePixelRatio;
                    const pct = val as number;
                    engine.setHardwareScalingLevel(baseScale / (pct / 100));
                } catch (_) { /* GameManager not yet initialized */ }
                break;
            }

            // Anti-aliasing — clamp to nearest valid power-of-2 sample count
            case "msaaSamples": {
                const raw = val as number;
                let clamped = 1;
                for (const s of VALID_MSAA_SAMPLES) {
                    if (s <= raw) clamped = s;
                }
                p.samples = clamped;
                break;
            }
            case "fxaaEnabled":
                p.fxaaEnabled = val as boolean;
                break;

            // Bloom
            case "bloomEnabled":
                p.bloomEnabled = val as boolean;
                break;
            case "bloomThreshold":
                p.bloomThreshold = val as number;
                break;
            case "bloomWeight":
                p.bloomWeight = val as number;
                break;
            case "bloomKernel":
                p.bloomKernel = val as number;
                break;
            case "bloomScale":
                p.bloomScale = val as number;
                break;

            // Image processing
            case "toneMappingEnabled":
                if (s) s.imageProcessingConfiguration.toneMappingEnabled = val as boolean;
                break;
            case "toneMappingType":
                if (s) s.imageProcessingConfiguration.toneMappingType = val as number;
                break;
            case "exposure":
                if (s) s.imageProcessingConfiguration.exposure = val as number;
                break;
            case "contrast":
                if (s) s.imageProcessingConfiguration.contrast = val as number;
                break;

            // Effects
            case "sharpenEnabled":
                p.sharpenEnabled = val as boolean;
                break;
            case "sharpenAmount":
                if (p.sharpenEnabled) p.sharpen.edgeAmount = val as number;
                break;
            case "grainEnabled":
                p.grainEnabled = val as boolean;
                break;
            case "grainIntensity":
                if (p.grainEnabled) p.grain.intensity = val as number;
                break;
        }
    }

    /**
     * Returns the currently bound pipeline (if any).
     * @returns The pipeline or null.
     */
    public get pipeline(): DefaultRenderingPipeline | null {
        return this._pipeline;
    }

    /**
     * Creates and configures a DefaultRenderingPipeline using current settings.
     * Animated grain is always enabled when grain is on.
     * @param scene - The Babylon scene.
     * @returns The configured pipeline.
     */
    public createPipeline(scene: Scene): DefaultRenderingPipeline {
        const pipeline = new DefaultRenderingPipeline(
            "defaultPipeline",
            true,
            scene,
            [scene.activeCamera!]
        );

        pipeline.imageProcessingEnabled = true;

        this.bindPipeline(pipeline, scene);

        // Animated grain should always be on when grain is enabled
        if (pipeline.grainEnabled) {
            pipeline.grain.animated = true;
        }

        return pipeline;
    }
}
