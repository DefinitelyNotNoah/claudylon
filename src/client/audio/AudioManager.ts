/**
 * Audio playback manager with spatial 3D audio support.
 * Uses round-robin pools for overlapping playback.
 * Spatial sounds attenuate with distance from the listener (player camera).
 *
 * WORKAROUND: Babylon.js 8.x has a bug where a shared `TmpPlayOptions` object
 * gets its `loop` property permanently set to `true` once ANY looping sound calls
 * `.play()`. This contaminates every subsequent one-shot `.play()` call, causing
 * all sounds to loop. To avoid this, all sounds are created with `loop: false`
 * and looping is managed manually via `onEndedObservable`.
 *
 * @module client/audio/AudioManager
 */

import { Scene } from "@babylonjs/core/scene";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Sound } from "@babylonjs/core/Audio/sound";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import "@babylonjs/core/Audio/audioSceneComponent";
import "@babylonjs/core/Audio/audioEngine";

/**
 * Safely sets a Sound's volume without triggering the Web Audio API
 * "setValueCurveAtTime overlaps" crash. Babylon.js's `setVolume()` uses
 * `setValueCurveAtTime` internally, which throws when two calls land at
 * the exact same audio context time (common at high frame rates).
 * This directly sets the gain node value instead.
 * @param sound - The Babylon.js Sound instance.
 * @param volume - Volume level (0-1).
 */
function safeSetVolume(sound: Sound, volume: number): void {
    try {
        // Access the internal gain node directly to avoid setValueCurveAtTime
        const gainNode = (sound as unknown as { _soundGain: GainNode | null })._soundGain;
        if (gainNode) {
            gainNode.gain.value = volume;
        } else {
            sound.setVolume(volume, 0);
        }
    } catch (_) {
        // Silently swallow if it still fails (edge case)
    }
}

/** Audio file paths relative to public/. */
const AUDIO_FILES: Record<string, string> = {
    // Weapons
    "pistol.mp3": "assets/audio/weapons/pistol.mp3",
    "rifle.mp3": "assets/audio/weapons/rifle.mp3",
    "sniper.mp3": "assets/audio/weapons/sniper.mp3",
    "sniper_lever.mp3": "assets/audio/weapons/sniper_lever.mp3",
    // Player
    "footsteps.mp3": "assets/audio/player/footsteps.mp3",
    "hitmarker.mp3": "assets/audio/player/hitmarker.mp3",
    "empty_click.mp3": "assets/audio/ambient/empty_click.mp3",
    "reload_rifle.mp3": "assets/audio/ambient/reload_rifle.mp3",
    // UI
    "levelup.mp3": "assets/audio/ui/levelup.mp3",
    // Ambient
    "ambient_wind.mp3": "assets/audio/ambient/ambient_wind.mp3",
    "ambient_warfare_2.mp3": "assets/audio/ambient/ambient_warfare_2.mp3",
};

/** Number of pooled Sound instances per audio file for overlapping playback. */
const POOL_SIZE = 6;

/** Maximum distance (cm) at which spatial sounds are audible. */
const SPATIAL_MAX_DISTANCE = 4000;

/** Reference distance (cm) at which spatial sounds are at full volume. */
const SPATIAL_REF_DISTANCE = 200;

/** Rolloff factor for spatial sound attenuation. */
const SPATIAL_ROLLOFF = 2.5;

/** Keys that should be created as spatial (3D positioned) sounds. */
const SPATIAL_KEYS = new Set([
    "pistol.mp3",
    "rifle.mp3",
    "sniper.mp3",
    "sniper_lever.mp3",
]);

/** Weapon keys that need a separate non-spatial pool for local player gunshots. */
const LOCAL_GUNSHOT_KEYS = new Set([
    "pistol.mp3",
    "rifle.mp3",
    "sniper.mp3",
]);

/** Per-key volume overrides (applied during pool construction). */
const VOLUME_OVERRIDES: Record<string, number> = {
    "rifle.mp3": 0.35,
    "reload_rifle.mp3": 0.5,
    "ambient_wind.mp3": 0.5,
};

/**
 * Manages audio playback for weapon sounds, effects, footsteps, and ambient audio.
 * Each audio file gets a pool of Sound instances so rapid-fire shots overlap
 * naturally instead of cutting each other off.
 * Spatial sounds use Babylon.js 3D audio to attenuate based on distance.
 */
export class AudioManager {
    private _scene: Scene;
    /** Spatial sound pools — used for bot/remote player sounds. */
    private _pools: Map<string, Sound[]> = new Map();
    private _poolIndex: Map<string, number> = new Map();
    /** Non-spatial sound pools — used for local player gunshots (no directional panning). */
    private _localPools: Map<string, Sound[]> = new Map();
    private _localPoolIndex: Map<string, number> = new Map();
    private _footstepSound: Sound | null = null;
    /** Whether footsteps are logically "wanted" (player is walking). */
    private _footstepWanted: boolean = false;
    /** Whether the footstep sound should re-trigger when it ends. */
    private _footstepLooping: boolean = false;
    /** Current footstep volume (fades from 1 → 0 on stop). */
    private _footstepVolume: number = 0;
    private _ambientWind: Sound | null = null;
    /** Whether ambient wind should re-trigger when it ends. */
    private _ambientWindLooping: boolean = false;
    private _ambientWarfare: Sound | null = null;
    private _warfareTimer: number = 0;
    private _warfareScheduled: boolean = false;
    /** Countdown until warfare burst begins fading out. */
    private _warfareStopTimer: number = -1;
    /** Whether the warfare burst is currently fading out. */
    private _warfareFading: boolean = false;
    /** Current warfare fade volume. */
    private _warfareVolume: number = 0;
    /** Target volume for warfare bursts. */
    private static readonly WARFARE_VOLUME = 0.05;

    /**
     * Creates the audio manager and preloads all sounds with pooling.
     * @param scene - The Babylon.js scene for audio context.
     */
    constructor(scene: Scene) {
        this._scene = scene;

        for (const [key, path] of Object.entries(AUDIO_FILES)) {
            // Skip ambient files from pool — handled separately
            if (key === "ambient_wind.mp3" || key === "ambient_warfare_2.mp3") continue;
            // Skip footsteps from pool — handled as looping sound
            if (key === "footsteps.mp3") continue;

            const isSpatial = SPATIAL_KEYS.has(key);
            const volumeOverride = VOLUME_OVERRIDES[key];
            const pool: Sound[] = [];
            for (let i = 0; i < POOL_SIZE; i++) {
                const opts: Record<string, unknown> = {
                    autoplay: false,
                    loop: false,
                };
                // Only pass spatial options to spatial sounds
                if (isSpatial) {
                    opts.spatialSound = true;
                    opts.maxDistance = SPATIAL_MAX_DISTANCE;
                    opts.distanceModel = "linear";
                }
                const sound = new Sound(`${key}_${i}`, path, this._scene, null, opts);
                if (isSpatial) {
                    sound.refDistance = SPATIAL_REF_DISTANCE;
                    sound.rolloffFactor = SPATIAL_ROLLOFF;
                }
                if (volumeOverride !== undefined) {
                    sound.setVolume(volumeOverride);
                }
                pool.push(sound);
            }
            this._pools.set(key, pool);
            this._poolIndex.set(key, 0);

            // Create a non-spatial pool for local player gunshots so turning
            // doesn't cause directional panning on the player's own shots
            if (LOCAL_GUNSHOT_KEYS.has(key)) {
                const localPool: Sound[] = [];
                for (let i = 0; i < POOL_SIZE; i++) {
                    const sound = new Sound(`${key}_local_${i}`, path, this._scene, null, {
                        autoplay: false,
                        loop: false,
                    });
                    if (volumeOverride !== undefined) {
                        sound.setVolume(volumeOverride);
                    }
                    localPool.push(sound);
                }
                this._localPools.set(key, localPool);
                this._localPoolIndex.set(key, 0);
            }
        }

        // Footstep sound — created with loop:false to avoid TmpPlayOptions bug.
        // Looping is managed manually via onEndedObservable.
        this._footstepSound = new Sound(
            "footsteps_loop",
            AUDIO_FILES["footsteps.mp3"],
            this._scene,
            null,
            { autoplay: false, loop: false, volume: 0.5 },
        );
        this._footstepSound.onEndedObservable.add(() => {
            if (this._footstepLooping && this._footstepSound) {
                this._footstepSound.play();
            }
        });

        // Ambient wind — created with loop:false, manually looped.
        // Uses the ready callback to start playback once the file is loaded,
        // since startAmbient() may be called before the sound is ready.
        this._ambientWind = new Sound(
            "ambient_wind",
            AUDIO_FILES["ambient_wind.mp3"],
            this._scene,
            () => {
                if (this._ambientWindLooping && this._ambientWind && !this._ambientWind.isPlaying) {
                    this._ambientWind.play();
                }
            },
            { autoplay: false, loop: false, volume: 0.15 },
        );
        this._ambientWind.onEndedObservable.add(() => {
            if (this._ambientWindLooping && this._ambientWind) {
                this._ambientWind.play();
            }
        });

        // Ambient warfare (one-shot, non-spatial, played at random intervals)
        // Lower playback rate for a more distant, low-frequency feel
        this._ambientWarfare = new Sound(
            "ambient_warfare",
            AUDIO_FILES["ambient_warfare_2.mp3"],
            this._scene,
            null,
            { autoplay: false, loop: false, volume: AudioManager.WARFARE_VOLUME },
        );
        this._ambientWarfare.setPlaybackRate(0.7);
    }

    /**
     * Sets the master volume for all audio output.
     * @param volume - Volume level between 0 (mute) and 1 (full).
     */
    public setMasterVolume(volume: number): void {
        const clamped = Math.max(0, Math.min(1, volume));
        Engine.audioEngine?.setGlobalVolume(clamped);
    }

    /**
     * Plays a weapon's gunshot sound non-spatially (full volume, no directional panning).
     * Used for the local player's own gunshots.
     * @param audioFile - The audio filename from WeaponStats (e.g. "pistol.mp3").
     */
    public playGunshot(audioFile: string): void {
        // Use the non-spatial local pool to avoid directional panning
        const pool = this._localPools.get(audioFile);
        if (!pool) return;

        const index = this._localPoolIndex.get(audioFile) ?? 0;
        const sound = pool[index];
        if (sound.isPlaying) sound.stop();
        sound.play();
        this._localPoolIndex.set(audioFile, (index + 1) % POOL_SIZE);
    }

    /**
     * Plays a weapon's gunshot sound at a world position (spatial, distance-attenuated).
     * Used for bot and remote player gunshots.
     * @param audioFile - The audio filename (e.g. "pistol.mp3").
     * @param position - World position of the sound source.
     */
    public playGunshotAt(audioFile: string, position: Vector3): void {
        const pool = this._pools.get(audioFile);
        if (!pool) return;

        const index = this._poolIndex.get(audioFile) ?? 0;
        const sound = pool[index];
        sound.setPosition(position);
        if (sound.isPlaying) sound.stop();
        sound.play();
        this._poolIndex.set(audioFile, (index + 1) % POOL_SIZE);
    }

    /**
     * Plays a named sound effect (non-spatial, full volume).
     * @param name - The audio filename key (e.g. "hitmarker.mp3").
     * @param duration - Optional max playback duration in seconds.
     */
    public playSound(name: string, duration?: number): void {
        this._playFromPool(name, duration);
    }

    /**
     * Plays a named sound effect at a world position (spatial, distance-attenuated).
     * @param name - The audio filename key.
     * @param position - World position of the sound source.
     */
    public playSoundAt(name: string, position: Vector3): void {
        const pool = this._pools.get(name);
        if (!pool) return;

        const index = this._poolIndex.get(name) ?? 0;
        const sound = pool[index];
        sound.setPosition(position);
        if (sound.isPlaying) sound.stop();
        sound.play();
        this._poolIndex.set(name, (index + 1) % POOL_SIZE);
    }

    /**
     * Marks footsteps as wanted — volume will ramp up instantly.
     */
    public startFootsteps(): void {
        this._footstepWanted = true;
    }

    /**
     * Marks footsteps as not wanted — volume will fade out smoothly.
     */
    public stopFootsteps(): void {
        this._footstepWanted = false;
    }

    /**
     * Per-frame footstep volume update. Fades out over ~200ms when stopped.
     * Uses setVolume(vol, 0) to set volume instantly and avoid Web Audio API
     * "setValueCurveAtTime overlaps" crash from rapid per-frame calls.
     * @param dt - Delta time in seconds.
     */
    public updateFootsteps(dt: number): void {
        if (!this._footstepSound) return;

        const targetVol = 0.5;
        const fadeSpeed = 5; // ~200ms fade (1 / 5 = 0.2s)

        if (this._footstepWanted) {
            // Snap to full volume immediately
            this._footstepVolume = targetVol;
            this._footstepLooping = true;
            if (!this._footstepSound.isPlaying) {
                safeSetVolume(this._footstepSound, targetVol);
                this._footstepSound.play();
            } else {
                safeSetVolume(this._footstepSound, targetVol);
            }
        } else if (this._footstepSound.isPlaying) {
            // Fade out
            this._footstepVolume = Math.max(0, this._footstepVolume - targetVol * fadeSpeed * dt);
            safeSetVolume(this._footstepSound, this._footstepVolume);
            if (this._footstepVolume <= 0) {
                this._footstepLooping = false;
                this._footstepSound.stop();
                this._footstepVolume = 0;
            }
        } else {
            // Not playing and not wanted — ensure looping flag is off
            this._footstepLooping = false;
        }
    }

    /**
     * Whether footsteps are currently playing.
     */
    public get isFootstepPlaying(): boolean {
        return this._footstepSound?.isPlaying ?? false;
    }

    /**
     * Returns true if any pooled instance of the given sound is currently playing.
     * @param name - The audio filename key.
     */
    public isSoundPlaying(name: string): boolean {
        const pool = this._pools.get(name);
        if (!pool) return false;
        return pool.some(s => s.isPlaying);
    }

    /**
     * Starts the ambient wind loop.
     */
    public startAmbient(): void {
        if (this._ambientWind && !this._ambientWind.isPlaying) {
            this._ambientWindLooping = true;
            this._ambientWind.play();
        }
        this._scheduleWarfare();
    }

    /**
     * Stops all ambient audio.
     */
    public stopAmbient(): void {
        this._ambientWindLooping = false;
        this._ambientWind?.stop();
        this._ambientWarfare?.stop();
        this._warfareScheduled = false;
        this._warfareStopTimer = -1;
    }

    /**
     * Updates ambient warfare scheduling, fade-out, and stop timer. Call each frame.
     * @param dt - Delta time in seconds.
     */
    public updateAmbient(dt: number): void {
        const fadeSpeed = 1; // ~330ms fade-out

        // Fade-out phase — ramp volume to zero then stop
        // Use setVolume(vol, 0) for instant set to avoid setValueCurveAtTime overlap crash
        if (this._warfareFading && this._ambientWarfare) {
            this._warfareVolume = Math.max(0, this._warfareVolume - AudioManager.WARFARE_VOLUME * fadeSpeed * dt);
            safeSetVolume(this._ambientWarfare, this._warfareVolume);
            if (this._warfareVolume <= 0) {
                this._ambientWarfare.stop();
                this._warfareFading = false;
                this._warfareStopTimer = -1;
            }
        }

        // Hold timer — counts down until fade begins
        if (this._warfareStopTimer > 0) {
            this._warfareStopTimer -= dt;
            if (this._warfareStopTimer <= 0) {
                this._warfareFading = true;
            }
        }

        if (!this._warfareScheduled) return;

        this._warfareTimer -= dt;
        if (this._warfareTimer <= 0) {
            if (this._ambientWarfare) {
                if (this._ambientWarfare.isPlaying) this._ambientWarfare.stop();
                this._warfareVolume = AudioManager.WARFARE_VOLUME;
                this._ambientWarfare.setVolume(this._warfareVolume);
                this._warfareFading = false;
                this._ambientWarfare.play();
                // Play for a random 1-3 second burst, then fade out
                this._warfareStopTimer = 1 + Math.random() * 2;
            }
            this._scheduleWarfare();
        }
    }

    /**
     * Schedules the next ambient warfare burst in 10 seconds.
     */
    private _scheduleWarfare(): void {
        this._warfareTimer = 10;
        this._warfareScheduled = true;
    }

    /**
     * Plays the next available Sound instance from the pool for the given key.
     * Non-spatial version — resets position to origin for local playback.
     * @param key - The audio file key.
     * @param duration - Optional max playback duration in seconds.
     */
    private _playFromPool(key: string, duration?: number): void {
        const pool = this._pools.get(key);
        if (!pool) return;

        const index = this._poolIndex.get(key) ?? 0;
        const sound = pool[index];
        sound.setPosition(Vector3.Zero());
        if (sound.isPlaying) sound.stop();
        sound.play(0, 0, duration);
        this._poolIndex.set(key, (index + 1) % POOL_SIZE);
    }

    /**
     * Disposes all pooled sounds and ambient audio.
     */
    public dispose(): void {
        for (const pool of this._pools.values()) {
            for (const sound of pool) {
                sound.dispose();
            }
        }
        this._pools.clear();
        this._poolIndex.clear();
        for (const pool of this._localPools.values()) {
            for (const sound of pool) {
                sound.dispose();
            }
        }
        this._localPools.clear();
        this._localPoolIndex.clear();
        this._footstepLooping = false;
        this._footstepSound?.dispose();
        this._ambientWindLooping = false;
        this._ambientWind?.dispose();
        this._ambientWarfare?.dispose();
    }
}
