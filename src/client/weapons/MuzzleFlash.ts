/**
 * Muzzle flash VFX: particle burst + brief point light at the weapon muzzle on fire.
 * Supports per-weapon-class tuning (pistol, rifle, sniper) for visual variety.
 * @module client/weapons/MuzzleFlash
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";

import type { WeaponCategory } from "../../shared/types";

/** Duration the muzzle light stays on before fading (seconds). */
const LIGHT_DURATION = 0.04;

/** Per-category particle counts for the flash burst. */
const BURST_COUNT: Record<WeaponCategory, number> = {
    pistol: 6,
    rifle: 10,
    sniper: 16,
};

/** Per-category peak light intensity (scene units). */
const LIGHT_INTENSITY: Record<WeaponCategory, number> = {
    pistol: 0.6,
    rifle: 1.0,
    sniper: 1.8,
};

/** Per-category light range (cm). */
const LIGHT_RANGE: Record<WeaponCategory, number> = {
    pistol: 200,
    rifle: 300,
    sniper: 500,
};

/** Per-category particle size range [min, max] in cm. */
const PARTICLE_SIZE: Record<WeaponCategory, [number, number]> = {
    pistol: [1.0, 2.5],
    rifle:  [1.5, 4.0],
    sniper: [2.5, 7.0],
};

/** Per-category particle emit power range [min, max] cm/s. */
const EMIT_POWER: Record<WeaponCategory, [number, number]> = {
    pistol: [4, 12],
    rifle:  [6, 20],
    sniper: [10, 35],
};

/**
 * Per-weapon-class muzzle flash effect.
 * Plays a burst of bright additive particles and a brief point-light pulse
 * at the muzzle position each time the weapon fires.
 */
export class MuzzleFlash {
    private _particleSystem: ParticleSystem;
    private _light: PointLight;
    private _category: WeaponCategory;
    /** Remaining light-on time in seconds. Positive = light is active. */
    private _lightTimer: number = 0;
    /** Peak intensity set at flash time — fades from here to 0. */
    private _peakIntensity: number = 0;

    /**
     * Creates the muzzle flash effect for a given weapon category.
     * @param scene - The Babylon.js scene.
     * @param emitter - The muzzle TransformNode to emit from.
     * @param category - Weapon category controlling visual intensity.
     */
    constructor(scene: Scene, emitter: TransformNode, category: WeaponCategory = "rifle") {
        this._category = category;

        /* --- Particle system -------------------------------------------- */
        this._particleSystem = new ParticleSystem("muzzle_flash", 40, scene);

        this._particleSystem.particleTexture = new Texture(
            "https://assets.babylonjs.com/textures/flare.png",
            scene
        );

        /* TransformNode is compatible at runtime; cast required for TS types. */
        this._particleSystem.emitter = emitter as unknown as import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh;
        this._particleSystem.isLocal = true;

        /* Emit along local +Z (barrel forward) with slight radial spread. */
        this._particleSystem.createConeEmitter(0.3, Math.PI * 0.12);

        const [sizeMin, sizeMax] = PARTICLE_SIZE[category];
        this._particleSystem.minSize = sizeMin;
        this._particleSystem.maxSize = sizeMax;

        this._particleSystem.minLifeTime = 0.025;
        this._particleSystem.maxLifeTime = 0.07;

        this._particleSystem.emitRate = 0;

        const [powerMin, powerMax] = EMIT_POWER[category];
        this._particleSystem.minEmitPower = powerMin;
        this._particleSystem.maxEmitPower = powerMax;

        /* Bright yellow-white core fading to hot orange. */
        this._particleSystem.color1 = new Color4(1.0, 1.0, 0.8, 1.0);
        this._particleSystem.color2 = new Color4(1.0, 0.85, 0.3, 1.0);
        this._particleSystem.colorDead = new Color4(0.8, 0.3, 0.0, 0.0);

        /* Size gradient: pop to full size immediately, shrink to nothing. */
        this._particleSystem.addSizeGradient(0.0, 1.0);
        this._particleSystem.addSizeGradient(0.4, 0.8);
        this._particleSystem.addSizeGradient(1.0, 0.0);

        this._particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
        this._particleSystem.gravity = Vector3.Zero();
        this._particleSystem.renderingGroupId = 1;

        this._particleSystem.start();

        /* --- Muzzle light ------------------------------------------------ */
        this._light = new PointLight("muzzle_light", Vector3.Zero(), scene);
        this._light.parent = emitter;
        this._light.position = Vector3.Zero();
        this._light.diffuse = new Color3(1.0, 0.8, 0.4);
        this._light.specular = new Color3(1.0, 0.8, 0.4);
        this._light.range = LIGHT_RANGE[category];
        this._light.intensity = 0;
    }

    /**
     * Triggers a muzzle flash burst. Call once per shot fired.
     */
    public flash(): void {
        this._particleSystem.manualEmitCount = BURST_COUNT[this._category];
        this._peakIntensity = LIGHT_INTENSITY[this._category];
        this._light.intensity = this._peakIntensity;
        this._lightTimer = LIGHT_DURATION;
    }

    /**
     * Updates the light fade-out. Call once per frame.
     * @param dt - Delta time in seconds.
     */
    public update(dt: number): void {
        if (this._lightTimer <= 0) return;

        this._lightTimer -= dt;
        if (this._lightTimer <= 0) {
            this._light.intensity = 0;
            this._lightTimer = 0;
        } else {
            /* Exponential fade for a snappy cutoff. */
            const t = this._lightTimer / LIGHT_DURATION;
            this._light.intensity = this._peakIntensity * t * t;
        }
    }

    /**
     * Updates the weapon category, adjusting all per-class parameters.
     * Call when the player switches to a different weapon class.
     * @param category - The new weapon category.
     */
    public setCategory(category: WeaponCategory): void {
        if (this._category === category) return;
        this._category = category;

        const [sizeMin, sizeMax] = PARTICLE_SIZE[category];
        this._particleSystem.minSize = sizeMin;
        this._particleSystem.maxSize = sizeMax;

        const [powerMin, powerMax] = EMIT_POWER[category];
        this._particleSystem.minEmitPower = powerMin;
        this._particleSystem.maxEmitPower = powerMax;

        this._light.range = LIGHT_RANGE[category];
    }

    /**
     * Disposes the particle system and muzzle light.
     */
    public dispose(): void {
        this._light.intensity = 0;
        this._particleSystem.dispose();
        this._light.dispose();
    }
}
