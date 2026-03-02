/**
 * Muzzle flash particle effect that plays at the weapon's muzzle point on fire.
 * @module client/weapons/MuzzleFlash
 */

import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/**
 * Creates a short burst particle effect at the muzzle when fired.
 * Uses Babylon's built-in particle system with a bright orange/yellow flare.
 */
export class MuzzleFlash {
    private _particleSystem: ParticleSystem;

    /**
     * Creates the muzzle flash particle system.
     * @param scene - The Babylon.js scene.
     * @param emitter - The muzzle TransformNode to emit from.
     */
    constructor(scene: Scene, emitter: TransformNode) {
        this._particleSystem = new ParticleSystem("muzzle_flash", 30, scene);

        this._particleSystem.particleTexture = new Texture(
            "https://assets.babylonjs.com/textures/flare.png",
            scene
        );

        /* Emit along local +Z (barrel forward) with slight spread. */
        this._particleSystem.createPointEmitter(
            new Vector3(-0.3, -0.3, 1),
            new Vector3(0.3, 0.3, 3)
        );

        this._particleSystem.emitter = emitter;
        this._particleSystem.isLocal = true;

        this._particleSystem.minSize = 1;
        this._particleSystem.maxSize = 4;
        this._particleSystem.minLifeTime = 0.02;
        this._particleSystem.maxLifeTime = 0.06;
        this._particleSystem.emitRate = 0;
        this._particleSystem.minEmitPower = 5;
        this._particleSystem.maxEmitPower = 15;

        this._particleSystem.color1 = new Color4(1.0, 0.9, 0.3, 1.0);
        this._particleSystem.color2 = new Color4(1.0, 0.5, 0.1, 1.0);
        this._particleSystem.colorDead = new Color4(0.5, 0.2, 0.0, 0.0);

        this._particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
        this._particleSystem.gravity = Vector3.Zero();

        this._particleSystem.renderingGroupId = 1;

        this._particleSystem.start();
    }

    /**
     * Triggers a muzzle flash burst by emitting a short burst of particles.
     */
    public flash(): void {
        this._particleSystem.manualEmitCount = 10;
    }

    /**
     * Disposes the particle system.
     */
    public dispose(): void {
        this._particleSystem.dispose();
    }
}
