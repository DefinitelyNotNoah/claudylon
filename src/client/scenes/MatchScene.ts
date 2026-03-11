/**
 * The playable match scene. Builds the Shipment map programmatically,
 * spawns the player, loads weapon viewmodel, and shows the crosshair HUD.
 * @module client/scenes/MatchScene
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
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
import { Mesh } from "@babylonjs/core/Meshes/mesh";

import "@babylonjs/core/Meshes/Builders/groundBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";

import { GraphicsSettings } from "../ui/GraphicsSettings";
import { GameScene } from "../core/GameScene";
import { InputManager } from "../core/InputManager";
import { PlayerController } from "../player/PlayerController";
import { WeaponViewmodel } from "../weapons/WeaponViewmodel";
import { WeaponManager } from "../weapons/WeaponManager";
import { Projectile } from "../weapons/Projectile";
import { WeaponSway } from "../weapons/WeaponSway";
import { AudioManager } from "../audio/AudioManager";
import { CrosshairHUD } from "../ui/CrosshairHUD";
import { HitIndicator } from "../ui/HitIndicator";
import { DeathOverlay } from "../ui/DeathOverlay";
import { PauseMenuUI } from "../ui/PauseMenuUI";
import { KillFeedUI } from "../ui/KillFeedUI";
import { ScoreboardUI } from "../ui/ScoreboardUI";
import type { ScoreboardEntry } from "../ui/ScoreboardUI";
import { MatchTimerUI } from "../ui/MatchTimerUI";
import { DebugOverlayUI, DEBUG_MODE_KEY } from "../ui/DebugOverlayUI";
import type { DebugRemotePlayerInfo } from "../ui/DebugOverlayUI";
import { DamageNumberUI } from "../ui/DamageNumberUI";
import { XPBarUI } from "../ui/XPBarUI";
import { LevelUpUI } from "../ui/LevelUpUI";
import { CreateClassUI } from "../ui/CreateClassUI";
import { KillNotificationUI } from "../ui/KillNotificationUI";
import { MinimapUI } from "../ui/MinimapUI";
import type { MinimapEntity } from "../ui/MinimapUI";
import { ProgressionManager } from "../progression/ProgressionManager";
import { GameManager } from "../core/GameManager";
import { NetworkManager } from "../network/NetworkManager";
import { RemotePlayer } from "../network/RemotePlayer";
import { MainMenuScene } from "./MainMenuScene";
import { PlayerStateEnum } from "../../shared/types";
import type { WeaponId, FireEventData } from "../../shared/types";
import { PLAYER_STATS, MASTER_VOLUME_KEY, DEFAULT_MASTER_VOLUME } from "../../shared/constants/PlayerConstants";
import { MATCH_DURATION_S, SHIPMENT_SPAWN_POINTS } from "../../shared/constants/MapConstants";
import { SELECTED_MAP_KEY, DEFAULT_MAP_ID } from "../../shared/constants/MapRegistry";
import type { MapId } from "../../shared/constants/MapRegistry";
import { createMapBuilder } from "../maps/MapFactory";
import {
    BOT_COUNT_KEY,
    BOT_DIFFICULTY_KEY,
    BOT_DIFFICULTIES,
    DEFAULT_BOT_COUNT,
    DEFAULT_BOT_DIFFICULTY,
    ENTITY_CULL_DISTANCE,
} from "../../shared/constants/BotConstants";
import { BotManager } from "../ai/BotManager";
import { WeaponDropManager } from "../weapons/WeaponDropManager";
import { ConsoleCommandRegistry } from "../core/ConsoleCommandRegistry";
import { DeveloperConsoleUI } from "../ui/DeveloperConsoleUI";
import { WEAPON_STATS } from "../../shared/constants";
import { PhysicsViewer } from "@babylonjs/core/Debug/physicsViewer";
import { ImGui } from "@mori2003/jsimgui";
import { drawPlayerTab } from "../ui/imgui/PlayerPanel";
import { drawBotTab } from "../ui/imgui/BotPanel";
import { drawWeaponsTab } from "../ui/imgui/WeaponsTab";
import { drawAudioTab } from "../ui/imgui/AudioTab";
import { drawGraphicsTab } from "../ui/imgui/GraphicsTab";
import { drawPhysicsTab } from "../ui/imgui/PhysicsTab";
import { drawProgressionTab } from "../ui/imgui/ProgressionTab";
import { drawPerformanceTab } from "../ui/imgui/PerformanceTab";
import { drawMirrorTab } from "../ui/imgui/MirrorTab";
import type { PlayerPanelContext } from "../ui/imgui/PlayerPanel";
import type { BotPanelContext, BotInfo } from "../ui/imgui/BotPanel";
import type { WeaponsTabContext } from "../ui/imgui/WeaponsTab";
import type { AudioTabContext } from "../ui/imgui/AudioTab";
import type { PhysicsTabContext } from "../ui/imgui/PhysicsTab";
import type { ProgressionTabContext } from "../ui/imgui/ProgressionTab";
import type { PerformanceTabContext } from "../ui/imgui/PerformanceTab";
import type { MirrorTabContext } from "../ui/imgui/MirrorTab";
import { MirrorClone } from "../debug/MirrorClone";
import { PROJECTILE_LIFETIME, setProjectileLifetime } from "../weapons/Projectile";
import { WEAPON_UNLOCK_REQUIREMENTS } from "../../shared/constants/WeaponConstants";
import { JumpSmokeEffect } from "../vfx/JumpSmokeEffect";

/** Gravity vector: 981 cm/s² downward. */
const GRAVITY = new Vector3(0, -981, 0);

/**
 * The main gameplay scene. Builds the Shipment-inspired map,
 * initializes the player, and sets up all gameplay systems.
 */
export class MatchScene extends GameScene {
    private _inputManager: InputManager | null = null;
    private _playerController: PlayerController | null = null;
    private _weaponViewmodel: WeaponViewmodel | null = null;
    private _weaponManager: WeaponManager | null = null;
    private _weaponSway: WeaponSway | null = null;
    private _audioManager: AudioManager | null = null;
    private _crosshairHUD: CrosshairHUD | null = null;
    private _hitIndicator: HitIndicator | null = null;
    private _deathOverlay: DeathOverlay | null = null;
    private _pauseMenuUI: PauseMenuUI | null = null;
    private _isPaused: boolean = false;
    private _onPointerLockChange: (() => void) | null = null;
    private _shadowGenerator: ShadowGenerator | null = null;

    // ─── HUD Overlays ──────────────────────────────────────────────
    private _killFeedUI: KillFeedUI | null = null;
    private _scoreboardUI: ScoreboardUI | null = null;
    private _matchTimerUI: MatchTimerUI | null = null;
    private _debugOverlayUI: DebugOverlayUI | null = null;
    private _damageNumberUI: DamageNumberUI | null = null;
    private _xpBarUI: XPBarUI | null = null;
    private _levelUpUI: LevelUpUI | null = null;
    private _killNotificationUI: KillNotificationUI | null = null;
    private _minimapUI: MinimapUI | null = null;

    // ─── Match Timer ─────────────────────────────────────────────
    private _matchTimeRemaining: number = MATCH_DURATION_S;

    // ─── End-of-Round State ───────────────────────────────────────
    private _isMatchEnded: boolean = false;
    private _endOfRoundCountdown: number = 0;

    // ─── Debug ───────────────────────────────────────────────────────
    private _debugNavMesh: Mesh | null = null;
    private _physicsViewer: PhysicsViewer | null = null;
    private _debugCapsuleMaterials: StandardMaterial[] = [];
    private _debugCapsuleOriginalState: Map<AbstractMesh, { isVisible: boolean; material: any }> = new Map();
    private _colliderDebugObserver: any = null;
    private _colliderDebugTrackedBodies: Set<any> = new Set();
    private _colliderDebugTrackedRagdolls: Set<string> = new Set();

    // ─── Bot AI Fields ─────────────────────────────────────────────
    private _botManager: BotManager | null = null;
    private _weaponDropManager: WeaponDropManager | null = null;
    private _localKills: number = 0;
    private _localDeaths: number = 0;

    // ─── Test Dummies (ragdoll debugging) ───────────────────────
    private _testDummies: Map<string, RemotePlayer> = new Map();

    // ─── Mirror Clone ─────────────────────────────────────────────
    private _mirrorClone: MirrorClone | null = null;

    // ─── VFX ──────────────────────────────────────────────────────
    /** Smoke puff effect for the local player's jump. */
    private _localJumpSmoke: JumpSmokeEffect | null = null;
    /** Smoke puff effects keyed by bot sessionId. */
    private _botJumpSmokes: Map<string, JumpSmokeEffect> = new Map();
    /** Previous player state for jump-transition detection. */
    private _prevPlayerState: PlayerStateEnum = PlayerStateEnum.Idle;
    /** Previous bot states for jump-transition detection, keyed by sessionId. */
    private _prevBotStates: Map<string, PlayerStateEnum> = new Map();

    // ─── Developer Console ────────────────────────────────────────
    private _consoleUI: DeveloperConsoleUI | null = null;
    private _consoleRegistry: ConsoleCommandRegistry | null = null;
    private _godMode: boolean = false;
    private _infiniteAmmo: boolean = false;
    private _timeScale: number = 1.0;
    private _savedVolume: number = 1.0;
    private _isMuted: boolean = false;

    // ─── Audio State Tracking ──────────────────────────────────────

    // ─── Networking Fields ────────────────────────────────────────
    private _remotePlayers: Map<string, RemotePlayer> = new Map();
    private _remoteProjectiles: Projectile[] = [];
    private _isNetworked: boolean = false;
    private _projectileIdCounter: number = 0;

    /**
     * Creates a new MatchScene.
     * @param manager - The GameManager singleton.
     */
    constructor(manager: GameManager) {
        super(manager);
    }

    /**
     * Initializes the scene: physics, map, lighting, props, player, weapon, HUD.
     */
    public async initialize(): Promise<void> {
        this._enablePhysics(GRAVITY);

        this._scene.clearColor = new Color4(0.53, 0.81, 0.92, 1.0);

        // Build the selected map
        const mapId = (localStorage.getItem(SELECTED_MAP_KEY) ?? DEFAULT_MAP_ID) as MapId;
        const mapBuilder = createMapBuilder(mapId, this._scene);
        const { spawnPoints, shadowGenerator } = await mapBuilder.build();
        this._shadowGenerator = shadowGenerator;

        this._inputManager = new InputManager(this._manager.canvas);

        this._playerController = new PlayerController(
            this._scene,
            this._inputManager,
            spawnPoints[0].position.clone()
        );
        await this._playerController.initialize();

        this._scene.activeCamera = this._playerController.camera;
        this._setupPostProcessing();

        this._scene.setRenderingAutoClearDepthStencil(1, true, true, true);

        const loadout = CreateClassUI.getLoadout();

        this._weaponViewmodel = new WeaponViewmodel(
            this._scene,
            this._playerController.viewmodelAnchor
        );
        await this._weaponViewmodel.loadWeapon(loadout.slot2);

        this._audioManager = new AudioManager(this._scene);
        const savedVol = localStorage.getItem(MASTER_VOLUME_KEY);
        this._audioManager.setMasterVolume(savedVol ? parseFloat(savedVol) : DEFAULT_MASTER_VOLUME);
        this._audioManager.startAmbient();

        this._weaponManager = new WeaponManager(
            this._scene,
            this._weaponViewmodel,
            this._audioManager,
            loadout.slot2,
            loadout.slot1
        );

        this._weaponSway = new WeaponSway(this._playerController.viewmodelAnchor);

        this._localJumpSmoke = new JumpSmokeEffect(this._scene);

        this._crosshairHUD = new CrosshairHUD(this._scene);
        this._hitIndicator = new HitIndicator(this._scene);
        this._deathOverlay = new DeathOverlay(this._scene);
        this._killFeedUI = new KillFeedUI(this._scene);
        this._scoreboardUI = new ScoreboardUI(this._scene);
        this._matchTimerUI = new MatchTimerUI(this._scene);
        this._damageNumberUI = new DamageNumberUI(this._scene);
        this._xpBarUI = new XPBarUI(this._scene);
        this._levelUpUI = new LevelUpUI(this._scene);
        this._killNotificationUI = new KillNotificationUI(this._scene);
        this._minimapUI = new MinimapUI(this._scene);

        // Debug overlay (toggled from main menu)
        this._debugOverlayUI = new DebugOverlayUI(this._scene);
        if (localStorage.getItem(DEBUG_MODE_KEY) === "true") {
            this._debugOverlayUI.show();
        }
        this._debugOverlayUI.getRemotePlayerInfo = (meshName: string): DebugRemotePlayerInfo | null => {
            const sessionId = meshName.replace("remote_body_", "");

            // Check bots first (offline mode)
            if (sessionId.startsWith("bot_") && this._botManager) {
                const botInfo = this._botManager.getBotInfo(sessionId);
                if (!botInfo) return null;
                return {
                    displayName: botInfo.displayName,
                    health: botInfo.health,
                    weaponId: botInfo.weaponId,
                    x: botInfo.x,
                    y: botInfo.y,
                    z: botInfo.z,
                    state: botInfo.state,
                };
            }

            // Networked remote players
            const remote = this._remotePlayers.get(sessionId);
            if (!remote) return null;
            const network = NetworkManager.getInstance();
            const state = network.matchRoom?.state as any;
            const playerSchema = state?.players?.get(sessionId);
            if (!playerSchema) return null;
            return {
                displayName: playerSchema.displayName ?? "Unknown",
                health: playerSchema.health ?? 0,
                weaponId: playerSchema.weaponId ?? "",
                x: playerSchema.x ?? 0,
                y: playerSchema.y ?? 0,
                z: playerSchema.z ?? 0,
                state: playerSchema.state ?? "",
            };
        };

        this._pauseMenuUI = new PauseMenuUI(
            this._scene,
            () => this._resumeFromUI(),
            () => {
                if (this._isNetworked) {
                    NetworkManager.getInstance().disconnect();
                }
                GameManager.getInstance().loadScene(MainMenuScene);
            }
        );
        this._pauseMenuUI.onDebugToggle = (enabled: boolean) => {
            if (enabled) {
                this._debugOverlayUI?.show();
            } else {
                this._debugOverlayUI?.hide();
            }
        };
        this._pauseMenuUI.onVolumeChange = (volume: number) => {
            this._audioManager?.setMasterVolume(volume);
        };
        this._pauseMenuUI.onRagdollToggle = (enabled: boolean) => {
            // Apply to bot RemotePlayers
            if (this._botManager) {
                for (const bot of this._botManager.bots) {
                    const remote = this._botManager.getRemotePlayer(bot.sessionId);
                    const cm = remote?.characterModel;
                    if (!cm) continue;
                    if (enabled && !cm.isRagdollInitialized) {
                        cm.initializeRagdoll();
                    } else if (!enabled && cm.isRagdollInitialized) {
                        if (cm.isRagdolling) cm.deactivateRagdoll();
                        cm.disposeRagdoll();
                    }
                }
            }
            // Apply to multiplayer RemotePlayers
            for (const remote of this._remotePlayers.values()) {
                const cm = remote.characterModel;
                if (!cm) continue;
                if (enabled && !cm.isRagdollInitialized) {
                    cm.initializeRagdoll();
                } else if (!enabled && cm.isRagdollInitialized) {
                    if (cm.isRagdolling) cm.deactivateRagdoll();
                    cm.disposeRagdoll();
                }
            }
        };

        // ─── Networking Setup ─────────────────────────────────────
        const network = NetworkManager.getInstance();
        if (network.isInMatch) {
            this._isNetworked = true;
            this._setupNetworkListeners(network);
            this._setupWeaponNetworkCallbacks(network);
            // Fire onPlayerAdded for players already in the room
            network.triggerExistingPlayers();
        }

        // ─── ImGui Panel Registration ──────────────────────────────
        this._manager.imguiManager.setDrawCallback(() => {
            if (this._playerController && ImGui.BeginTabItem("Player")) {
                drawPlayerTab(this._buildPlayerPanelContext());
                ImGui.EndTabItem();
            }
            if (this._botManager && ImGui.BeginTabItem("Bots")) {
                drawBotTab(this._buildBotPanelContext());
                ImGui.EndTabItem();
            }
            if (this._weaponManager && ImGui.BeginTabItem("Weapons")) {
                drawWeaponsTab(this._buildWeaponsTabContext());
                ImGui.EndTabItem();
            }
            if (this._audioManager && ImGui.BeginTabItem("Audio")) {
                drawAudioTab(this._buildAudioTabContext());
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Graphics")) {
                drawGraphicsTab();
                ImGui.EndTabItem();
            }
            if (this._playerController && ImGui.BeginTabItem("Physics")) {
                drawPhysicsTab(this._buildPhysicsTabContext());
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Progression")) {
                drawProgressionTab(this._buildProgressionTabContext());
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Performance")) {
                drawPerformanceTab(this._buildPerformanceTabContext());
                ImGui.EndTabItem();
            }
            if (ImGui.BeginTabItem("Mirror")) {
                drawMirrorTab(this._buildMirrorTabContext());
                ImGui.EndTabItem();
            }
        });

        // ─── Weapon Drop System ──────────────────────────────────
        this._weaponDropManager = new WeaponDropManager(this._scene);
        this._weaponDropManager.onSameWeaponPickup = (weaponId) => {
            this._weaponManager?.addAmmoForWeapon(weaponId);
            if (this._weaponManager && this._crosshairHUD) {
                const w = this._weaponManager.activeWeapon;
                this._crosshairHUD.updateAmmo(w.currentAmmo, w.reserveAmmo);
            }
        };
        this._weaponDropManager.onDifferentWeaponPickup = (newWeaponId, currentAmmo, reserveAmmo) => {
            this._weaponManager?.replaceActiveWeapon(newWeaponId, currentAmmo, reserveAmmo);
            if (this._weaponManager && this._crosshairHUD) {
                const w = this._weaponManager.activeWeapon;
                this._crosshairHUD.updateAmmo(w.currentAmmo, w.reserveAmmo);
                this._crosshairHUD.updateWeaponName(w.name);
            }
        };
        this._weaponDropManager._tossWeaponAmmo = () => {
            const w = this._weaponManager!.activeWeapon;
            return { currentAmmo: w.currentAmmo, reserveAmmo: w.reserveAmmo };
        };

        // ─── Bot AI Setup (Offline Only) ─────────────────────────
        if (!this._isNetworked) {
            const botCount = parseInt(localStorage.getItem(BOT_COUNT_KEY) ?? "", 10) || DEFAULT_BOT_COUNT;
            const botDifficulty = localStorage.getItem(BOT_DIFFICULTY_KEY) ?? DEFAULT_BOT_DIFFICULTY;
            this._botManager = new BotManager(this._scene, botDifficulty, this._audioManager);
            this._botManager.weaponDropManager = this._weaponDropManager;
            await this._botManager.initialize(botCount);
            this._setupOfflineWeaponCallbacks();
        }

        // ─── Developer Console ──────────────────────────────────
        this._consoleRegistry = new ConsoleCommandRegistry();
        this._registerConsoleCommands();
        this._consoleUI = new DeveloperConsoleUI(this._scene, this._consoleRegistry);
        this._consoleUI.onShow = () => {
            if (this._inputManager) {
                this._inputManager.inputSuppressed = true;
                this._inputManager.pointerLockEnabled = false;
            }
            document.exitPointerLock();
        };
        this._consoleUI.onHide = () => {
            if (this._inputManager) {
                // Only unsuppress if ImGui isn't also open
                const imguiOpen = this._manager.imguiManager.isVisible;
                if (!imguiOpen) {
                    this._inputManager.inputSuppressed = false;
                }
                if (!imguiOpen && !this._isPaused) {
                    this._inputManager.pointerLockEnabled = true;
                }
            }
            if (!this._manager.imguiManager.isVisible && !this._isPaused) {
                try {
                    const p = this._manager.canvas.requestPointerLock() as unknown;
                    if (p instanceof Promise) {
                        (p as Promise<void>).catch(() => {});
                    }
                } catch (_) { /* ignore */ }
            }
        };

        /*
         * Pointer lock changes:
         * - Lost while playing (ESC, alt-tab): freeze the player so residual
         *   mouse movement doesn't spin the camera. Next canvas click re-locks
         *   silently via InputManager and unfreezes.
         * - Gained while paused (canvas click after P-pause): resume gameplay.
         * - Gained while not paused (re-lock after ESC): unfreeze the player.
         *
         * Only the P key shows the pause menu. ESC/alt-tab just temporarily
         * lose pointer lock without showing any UI.
         */
        this._onPointerLockChange = () => {
            // Skip pointer lock changes during end-of-round cinematic
            if (this._isMatchEnded) return;

            const locked = document.pointerLockElement === this._manager.canvas;
            if (locked) {
                if (this._isPaused) {
                    this._onResumed();
                } else if (this._playerController) {
                    this._playerController.paused = false;
                }
            } else if (!this._isPaused && this._playerController) {
                this._playerController.paused = true;
            }
        };
        document.addEventListener("pointerlockchange", this._onPointerLockChange);

        this._scene.onBeforeRenderObservable.add(() => {
            const engineDt = this._scene.getEngine().getDeltaTime();
            let dt = Math.min(engineDt / 1000, 0.05);
            dt *= this._timeScale;

            // Console toggle (backtick)
            if (this._inputManager?.openConsole) {
                if (this._consoleUI?.isVisible) {
                    this._consoleUI.hide();
                } else {
                    this._consoleUI?.show();
                }
            }

            // ImGui toggle — works even when input is suppressed
            const imgui = this._manager.imguiManager;
            if (this._inputManager?.toggleImGui) {
                imgui.toggle();
                // Immediately disable/enable pointer lock on toggle so clicks
                // over ImGui windows don't trigger requestPointerLock().
                if (imgui.isVisible) {
                    this._inputManager.inputSuppressed = true;
                    this._inputManager.pointerLockEnabled = false;
                    document.exitPointerLock();
                } else if (!this._isPaused) {
                    // Only unsuppress if the console isn't also open
                    const consoleOpen = this._consoleUI?.isVisible ?? false;
                    if (!consoleOpen) {
                        this._inputManager.inputSuppressed = false;
                    }
                    this._inputManager.pointerLockEnabled = true;
                }
            }

            if (this._inputManager?.pause) {
                if (this._isPaused) {
                    this._resumeGame();
                } else {
                    this._pauseGame();
                }
            }

            // Navmesh debug toggle
            if (this._inputManager?.debugNavmesh) {
                this._toggleDebugNavMesh();
            }

            // Collider debug toggle (N key)
            if (this._inputManager?.showColliders) {
                this._consoleRegistry?.execute("cl_show_colliders");
            }

            // Scoreboard toggle (works even when paused/dead, but not during end-of-round)
            if (!this._isMatchEnded) {
                if (this._inputManager?.tab) {
                    if (!this._scoreboardUI?.isVisible) {
                        this._scoreboardUI?.show();
                    }
                    this._updateScoreboard();
                } else if (this._scoreboardUI?.isVisible) {
                    this._scoreboardUI?.hide();
                }
            }

            // End-of-round countdown
            if (this._isMatchEnded) {
                this._endOfRoundCountdown -= dt;
                if (this._endOfRoundCountdown > 0) {
                    this._scoreboardUI?.showCountdown(this._endOfRoundCountdown);
                }
            }

            // Match timer
            if (this._isNetworked) {
                const state = NetworkManager.getInstance().matchRoom?.state as any;
                if (state?.timeRemaining !== undefined) {
                    this._matchTimeRemaining = state.timeRemaining;
                }
            } else {
                this._matchTimeRemaining -= dt;
                if (this._matchTimeRemaining <= 0) {
                    this._matchTimeRemaining = MATCH_DURATION_S;
                }
            }
            this._matchTimerUI?.updateTime(this._matchTimeRemaining, dt);

            // Debug overlay
            if (this._debugOverlayUI?.isVisible && this._playerController && this._weaponManager) {
                const weapon = this._weaponManager.activeWeapon;
                this._debugOverlayUI.update(
                    dt,
                    this._playerController.camera,
                    this._playerController.state,
                    this._playerController.currentHealth,
                    weapon.name,
                    weapon.currentAmmo,
                    weapon.reserveAmmo,
                );
            }

            if (!this._isPaused) {
                this._updateWeaponSystem();
                this._updateWeaponDrops(dt);

                if (this._isNetworked) {
                    this._sendNetworkUpdate();
                    this._updateRemotePlayers();
                } else if (this._botManager && this._playerController) {
                    this._updateBots(dt);
                }

                // Mirror clone tracks player state
                this._mirrorClone?.update(dt);

                // Jump smoke VFX
                this._updateJumpSmoke();
            }

            // Minimap update (runs even when paused)
            this._updateMinimap();

            // Footstep audio
            this._updatePlayerAudio();
            this._audioManager?.updateFootsteps(dt);

            // Ambient audio scheduling
            this._audioManager?.updateAmbient(dt);
        });
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
     * Sets up the post-processing pipeline using persisted GraphicsSettings.
     * All parameters are controlled via the Options menu.
     */
    private _setupPostProcessing(): void {
        const gfx = GraphicsSettings.getInstance();
        gfx.createPipeline(this._scene);
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

    /**
     * Pauses the game. Shows pause menu, hides HUD, freezes player.
     * Called by P key or when pointer lock is lost externally (alt-tab).
     */
    private _onPaused(): void {
        this._isPaused = true;
        this._pauseMenuUI?.show();
        this._crosshairHUD?.hide();
        this._audioManager?.stopFootsteps();
        if (this._inputManager) {
            this._inputManager.pointerLockEnabled = false;
        }
        if (this._playerController) {
            this._playerController.paused = true;
        }
    }

    /**
     * Resumes the game. Hides pause menu, shows HUD, unfreezes player.
     * Called when pointer lock is re-acquired after being paused.
     */
    private _onResumed(): void {
        this._isPaused = false;
        this._pauseMenuUI?.hide();
        this._crosshairHUD?.show();
        if (this._inputManager) {
            this._inputManager.pointerLockEnabled = true;
        }
        if (this._playerController) {
            this._playerController.paused = false;
        }
    }

    /**
     * Pauses via P key. Programmatic exitPointerLock() has no cooldown,
     * so requestPointerLock() will work immediately when resuming.
     */
    private _pauseGame(): void {
        document.exitPointerLock();
        this._onPaused();
    }

    /**
     * Resumes via P key or Resume button. Requests pointer lock directly.
     * When the lock succeeds, pointerlockchange fires and _onResumed runs.
     */
    private _resumeGame(): void {
        this._pauseMenuUI?.hide();
        this._crosshairHUD?.show();
        if (this._inputManager) {
            this._inputManager.pointerLockEnabled = true;
        }
        try {
            const p = this._manager.canvas.requestPointerLock() as unknown;
            if (p instanceof Promise) {
                (p as Promise<void>).catch(() => {
                    this._isPaused = false;
                });
            }
        } catch (_) {
            this._isPaused = false;
        }
    }

    /**
     * Called from the Resume button's pointerdown. Delegates to _resumeGame().
     */
    private _resumeFromUI(): void {
        this._resumeGame();
    }

    /**
     * Toggles the navmesh debug visualization on/off.
     */
    private _toggleDebugNavMesh(): void {
        if (this._debugNavMesh) {
            this._debugNavMesh.dispose();
            this._debugNavMesh = null;
            return;
        }

        const navManager = this._botManager?.navigationManager;
        if (!navManager) return;

        const mesh = navManager.createDebugNavMesh();
        if (!mesh) return;

        const mat = new StandardMaterial("navmesh_debug_mat", this._scene);
        mat.diffuseColor = new Color3(0, 0.5, 1);
        mat.alpha = 0.3;
        mesh.material = mat;
        mesh.position.y += 2;
        this._debugNavMesh = mesh;
    }

    // ─── Networking Methods ─────────────────────────────────────────

    /**
     * Registers all network event callbacks for the match room.
     * @param network - The NetworkManager singleton.
     */
    private _setupNetworkListeners(network: NetworkManager): void {
        const callbacks = network.matchCallbacks;

        network.onPlayerAdded = (sessionId: string, player: any) => {
            console.log(`[Match] Remote player joined: ${sessionId}`);
            const remote = new RemotePlayer(
                this._scene,
                sessionId,
                player.displayName ?? "Player",
                player.x ?? 0,
                player.y ?? 0,
                player.z ?? 0,
            );
            this._remotePlayers.set(sessionId, remote);

            // Listen for schema changes on this player using Callbacks API
            if (callbacks) {
                callbacks.onChange(player, () => {
                    remote.updateFromServer(
                        player.x,
                        player.y,
                        player.z,
                        player.yaw,
                        player.health,
                        player.state,
                        player.weaponId,
                        player.leanAmount ?? 0,
                    );
                });
            }
        };

        network.onPlayerRemoved = (sessionId: string) => {
            console.log(`[Match] Remote player left: ${sessionId}`);
            const remote = this._remotePlayers.get(sessionId);
            if (remote) {
                remote.dispose();
                this._remotePlayers.delete(sessionId);
            }
        };

        network.onRemoteFire = (data: any) => {
            const origin = new Vector3(data.x, data.y, data.z);
            const direction = new Vector3(data.dirX, data.dirY, data.dirZ);
            const projectile = new Projectile(
                this._scene,
                origin,
                direction,
                data.speed,
                data.size,
                data.damage,
            );
            this._remoteProjectiles.push(projectile);

            // Trigger recoil animation on the firing remote player's weapon
            if (data.ownerId) {
                const remote = this._remotePlayers.get(data.ownerId);
                if (remote) {
                    remote.triggerRecoil();
                }
            }

            // Spatial gunshot sound from remote player position
            if (this._audioManager && data.weaponId) {
                const audioFile = data.weaponId === "intervention" || data.weaponId === "50cal" || data.weaponId === "svd"
                    ? "sniper.mp3"
                    : data.weaponId === "ak47" || data.weaponId === "m4a1" || data.weaponId === "scar"
                        ? "rifle.mp3"
                        : "pistol.mp3";
                this._audioManager.playGunshotAt(audioFile, origin);
            }
        };

        network.onHitConfirmed = (data: any) => {
            // Attacker gets hitmarker sound
            this._audioManager?.playSound("hitmarker.mp3");
        };

        network.onPlayerHit = (data: any) => {
            // Only the victim processes this
            if (data.victimId !== network.sessionId) return;

            console.log(`[Match] Hit received: ${data.damage} dmg, health: ${data.newHealth}`);
            if (this._playerController) {
                this._playerController.takeDamage(data.damage);
                this._crosshairHUD?.updateHealth(this._playerController.currentHealth);

                // Show directional hit indicator
                this._hitIndicator?.showHit(
                    data.attackerX,
                    data.attackerY,
                    data.attackerZ,
                    this._playerController.camera,
                );
            }
        };

        network.onPlayerKilled = (data: any) => {
            console.log(`[Match] Kill: ${data.victimName} by ${data.killerName} [${data.weaponId}]`);

            // Kill feed entry for all players
            this._killFeedUI?.addKill(
                data.killerName ?? "Unknown",
                data.victimName ?? "Unknown",
                data.weaponId ?? "",
                data.killerId === network.sessionId,
                data.victimId === network.sessionId,
            );

            // XP gain for the killer (local player)
            if (data.killerId === network.sessionId) {
                this._awardXP();
                this._killNotificationUI?.addKill(100, data.victimName ?? "Unknown");
            }

            if (data.victimId === network.sessionId && this._playerController) {
                this._playerController.die();

                // Drop the player's weapon
                if (this._weaponManager && this._weaponDropManager) {
                    const cam = this._playerController.camera;
                    const dropPos = cam.position.clone();
                    dropPos.y -= 30;
                    const w = this._weaponManager.activeWeapon;
                    this._weaponDropManager.spawnDrop(
                        w.id,
                        dropPos,
                        cam.rotation.y,
                        w.currentAmmo,
                        w.reserveAmmo,
                    );
                }

                this._weaponManager?.onDeath();
                this._crosshairHUD?.hide();
                this._deathOverlay?.show(data.killerName ?? "Unknown", data.weaponId ?? "");
            }
        };

        network.onSpawn = (data: any) => {
            if (this._playerController) {
                this._playerController.teleport(new Vector3(data.x, data.y, data.z));
            }
        };

        network.onRespawn = (data: any) => {
            if (this._playerController) {
                this._playerController.respawn(new Vector3(data.x, data.y, data.z));
                this._weaponManager?.onRespawn();
                this._crosshairHUD?.updateHealth(this._playerController.currentHealth);
                this._crosshairHUD?.show();
                this._deathOverlay?.hide();
            }
        };

        network.onMatchEnded = (data: any) => {
            console.log("[Match] Match ended, showing end-of-round cinematic");
            this._isMatchEnded = true;
            this._endOfRoundCountdown = 10;

            // Freeze player input
            if (this._playerController) {
                this._playerController.paused = true;
            }

            // Move camera to bird's-eye view of the map
            const camera = this._playerController?.camera;
            if (camera) {
                camera.position.set(0, 2500, 0);
                camera.rotation.set(Math.PI / 2, 0, 0);
            }

            // Hide gameplay HUD
            this._crosshairHUD?.hide();
            this._deathOverlay?.hide();
            this._matchTimerUI?.hide();

            // Exit pointer lock to show cursor
            document.exitPointerLock();
            if (this._inputManager) {
                this._inputManager.pointerLockEnabled = false;
            }

            // Show scoreboard with "MATCH OVER" title
            this._scoreboardUI?.setTitle("MATCH OVER");
            this._scoreboardUI?.show();
            if (data?.scoreboard) {
                const entries: ScoreboardEntry[] = data.scoreboard.map((p: any) => ({
                    sessionId: p.sessionId,
                    displayName: p.displayName,
                    kills: p.kills,
                    deaths: p.deaths,
                    isLocal: p.sessionId === network.sessionId,
                }));
                this._scoreboardUI?.updatePlayers(entries);
            }
        };

        network.onMatchReset = () => {
            console.log("[Match] Match reset");
            this._isMatchEnded = false;
            this._endOfRoundCountdown = 0;

            // Hide end-of-round UI
            this._scoreboardUI?.resetTitle();
            this._scoreboardUI?.hide();
            this._deathOverlay?.hide();

            // Restore gameplay HUD
            this._crosshairHUD?.show();
            this._matchTimerUI?.show();
            this._matchTimeRemaining = MATCH_DURATION_S;

            // Unfreeze player (respawn message handles position)
            if (this._playerController) {
                this._playerController.paused = false;
            }

            // Re-enable pointer lock
            if (this._inputManager) {
                this._inputManager.pointerLockEnabled = true;
            }
            try {
                const p = this._manager.canvas.requestPointerLock() as unknown;
                if (p instanceof Promise) {
                    (p as Promise<void>).catch(() => {});
                }
            } catch (_) {
                // Pointer lock request may fail, player can click to re-lock
            }
        };
    }

    /**
     * Wires weapon callbacks to send fire/hit events over the network.
     * @param network - The NetworkManager singleton.
     */
    private _setupWeaponNetworkCallbacks(network: NetworkManager): void {
        if (!this._weaponManager) return;

        this._weaponManager.onFire = (origin, direction, weapon) => {
            const projectileId = `${network.sessionId}_${this._projectileIdCounter++}`;
            const fireData: FireEventData = {
                projectileId,
                x: origin.x,
                y: origin.y,
                z: origin.z,
                dirX: direction.x,
                dirY: direction.y,
                dirZ: direction.z,
                speed: weapon.stats.projectileSpeed,
                damage: weapon.stats.damage,
                size: weapon.stats.projectileSize,
                weaponId: weapon.id,
            };
            network.sendFire(fireData);
        };

        this._weaponManager.onProjectileHit = (hitInfo, damage, weaponId) => {
            const meshName = hitInfo.hitMeshName;
            if (meshName.startsWith("remote_body_")) {
                const targetSessionId = meshName.replace("remote_body_", "");
                const projectileId = `${network.sessionId}_hit_${this._projectileIdCounter}`;
                network.sendHitClaim({
                    projectileId,
                    targetSessionId,
                    damage,
                    weaponId: weaponId as WeaponId,
                });

                // Floating damage number at hit point
                this._damageNumberUI?.show(hitInfo.position, damage, false);
            }
        };
    }

    // ─── Bot AI Methods (Offline) ──────────────────────────────────

    /**
     * Wires weapon hit callbacks for offline bot hit detection.
     * When a player projectile hits a mesh named `remote_body_bot_*`,
     * it applies damage to the corresponding bot.
     */

    private _setupOfflineWeaponCallbacks(): void {
        if (!this._weaponManager) return;

        this._weaponManager.onProjectileHit = (hitInfo, damage, weaponId) => {
            const meshName = hitInfo.hitMeshName;

            // ── Check for ragdolled body hit (test dummies + dead bots) ──
            const ragdollOwner = hitInfo.hitMesh?.metadata?.ragdollOwner as string | undefined;
            if (ragdollOwner) {
                // Find the RemotePlayer that owns this ragdoll
                const remote = this._testDummies.get(ragdollOwner)
                    ?? this._botManager?.getRemotePlayer(ragdollOwner);
                if (remote?.characterModel?.isRagdolling) {
                    const hitWeaponStats = WEAPON_STATS[weaponId as keyof typeof WEAPON_STATS];
                    const boneName = remote.characterModel.applyImpulseAtPoint(
                        hitInfo.position,
                        hitInfo.direction,
                        hitWeaponStats?.ragdollImpulse ?? 1000,
                    );
                    if (boneName) {
                        this._audioManager?.playSound("hitmarker.mp3");
                    }
                }
                return;
            }

            // ── Check for live bot capsule hit ──
            if (meshName.startsWith("remote_body_bot_") && this._botManager) {
                const botSessionId = meshName.replace("remote_body_", "");
                const result = this._botManager.handlePlayerHitBot(botSessionId, damage);
                if (result) {
                    // Hitmarker sound
                    this._audioManager?.playSound("hitmarker.mp3");

                    // Floating damage number
                    this._damageNumberUI?.show(hitInfo.position, damage, result.killed);

                    if (result.killed) {
                        this._localKills++;
                        this._killFeedUI?.addKill(
                            "You",
                            result.botName,
                            weaponId,
                            true,
                            false,
                        );

                        // XP gain on kill
                        this._awardXP();

                        // Kill notification
                        this._killNotificationUI?.addKill(100, result.botName);

                        // Trigger ragdoll using the projectile's travel direction
                        const remote = this._botManager!.getRemotePlayer(botSessionId);
                        if (remote) {
                            const stats = WEAPON_STATS[weaponId as keyof typeof WEAPON_STATS];
                            remote.die(hitInfo.direction, stats?.ragdollImpulse);
                        }
                    }
                }
            }
        };
    }

    /**
     * Awards XP for a kill, updates XP bar, and shows level-up popup if applicable.
     */
    private _awardXP(): void {
        const manager = ProgressionManager.getInstance();
        const result = manager.addXP(manager.xpPerKill);

        this._xpBarUI?.onXPGained(result.leveledUp);

        if (result.leveledUp) {
            this._levelUpUI?.show(result.newLevel, result.unlockedWeapons);
            this._audioManager?.playSound("levelup.mp3");
        }
    }

    /**
     * Per-frame bot update. Runs bot AI, processes bot-hit-player events,
     * handles player death from bot damage.
     * @param dt - Delta time in seconds.
     */
    private _updateBots(dt: number): void {
        if (!this._botManager || !this._playerController) return;

        const playerPos = this._playerController.position;
        const playerHealth = this._playerController.currentHealth;

        const events = this._botManager.update(dt, playerPos, playerHealth);

        // Process bot hits on player
        for (const hit of events.hitPlayer) {
            if (this._playerController.currentHealth <= 0) break;

            if (this._godMode) continue;

            this._playerController.takeDamage(hit.damage);
            this._crosshairHUD?.updateHealth(this._playerController.currentHealth);

            // Directional hit indicator
            this._hitIndicator?.showHit(
                hit.botPosition.x,
                hit.botPosition.y,
                hit.botPosition.z,
                this._playerController.camera,
            );
        }

        // Process bot kills on player
        if (events.killPlayer.length > 0 && this._playerController.currentHealth <= 0) {
            const killer = events.killPlayer[0];
            this._localDeaths++;
            this._playerController.die();

            // Drop the player's weapon
            if (this._weaponManager && this._weaponDropManager) {
                const cam = this._playerController.camera;
                const dropPos = cam.position.clone();
                dropPos.y -= 30;
                const w = this._weaponManager.activeWeapon;
                this._weaponDropManager.spawnDrop(
                    w.id,
                    dropPos,
                    cam.rotation.y,
                    w.currentAmmo,
                    w.reserveAmmo,
                );
            }

            this._weaponManager?.onDeath();
            this._crosshairHUD?.hide();
            this._deathOverlay?.show(killer.botName, killer.weaponId);
            this._killFeedUI?.addKill(
                killer.botName,
                "You",
                killer.weaponId,
                false,
                true,
            );

            // Respawn after 3 seconds
            setTimeout(() => {
                if (!this._playerController || this._isMatchEnded) return;
                const sp = SHIPMENT_SPAWN_POINTS[Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length)];
                const spawnPos = new Vector3(sp.x, sp.y, sp.z);
                this._playerController.respawn(spawnPos);
                this._weaponManager?.onRespawn();
                this._crosshairHUD?.updateHealth(this._playerController.currentHealth);
                this._crosshairHUD?.show();
                this._deathOverlay?.hide();
            }, 3000);
        }
    }

    /**
     * Updates footstep loop and landing sound based on player state transitions.
     */
    private _updatePlayerAudio(): void {
        if (!this._playerController || !this._audioManager) return;

        const state = this._playerController.state;

        // Footstep loop: play while Walking, stop in noclip or any other state
        if (state === PlayerStateEnum.Walking && !this._playerController.isNoclip) {
            this._audioManager.startFootsteps();
        } else {
            this._audioManager.stopFootsteps();
        }
    }

    /**
     * Detects jump-state transitions for the local player and all bots,
     * triggering a cartoon smoke puff at their feet when they leave the ground.
     */
    private _updateJumpSmoke(): void {
        // Local player
        if (this._playerController && this._localJumpSmoke) {
            const currentState = this._playerController.state;
            if (
                this._prevPlayerState !== PlayerStateEnum.Jumping &&
                currentState === PlayerStateEnum.Jumping
            ) {
                const pos = this._playerController.position.clone();
                pos.y += 2; // slightly above ground to avoid z-fighting
                this._localJumpSmoke.play(pos);
            }
            this._prevPlayerState = currentState;
        }

        // Bots (offline mode)
        if (this._botManager) {
            for (const bot of this._botManager.bots) {
                const sid = bot.sessionId;
                const currentState = bot.state;
                const prevState = this._prevBotStates.get(sid) ?? PlayerStateEnum.Idle;

                if (
                    prevState !== PlayerStateEnum.Jumping &&
                    currentState === PlayerStateEnum.Jumping
                ) {
                    // Lazily create a smoke effect for this bot on first jump
                    if (!this._botJumpSmokes.has(sid)) {
                        this._botJumpSmokes.set(sid, new JumpSmokeEffect(this._scene));
                    }
                    const smokeEffect = this._botJumpSmokes.get(sid)!;
                    const pos = bot.position.clone();
                    pos.y += 2;
                    smokeEffect.play(pos);
                }

                this._prevBotStates.set(sid, currentState);
            }
        }
    }

    /**
     * Gathers bot and remote player positions and updates the minimap.
     */
    private _updateMinimap(): void {
        if (!this._minimapUI || !this._playerController) return;

        const entities: MinimapEntity[] = [];

        // Bots (offline)
        if (this._botManager) {
            for (const bot of this._botManager.bots) {
                entities.push({
                    id: bot.sessionId,
                    x: bot.position.x,
                    z: bot.position.z,
                    isDead: bot.isDead,
                });
            }
        }

        // Remote players (networked)
        for (const [sessionId, remote] of this._remotePlayers) {
            entities.push({
                id: sessionId,
                x: remote.position.x,
                z: remote.position.z,
                isDead: remote.isDead,
            });
        }

        this._minimapUI.update(
            this._playerController.position.x,
            this._playerController.position.z,
            this._playerController.yaw,
            entities,
        );
    }

    /**
     * Builds scoreboard entries from match state and updates the scoreboard UI.
     */
    private _updateScoreboard(): void {
        if (!this._scoreboardUI) return;

        const entries: ScoreboardEntry[] = [];
        const network = NetworkManager.getInstance();

        if (this._isNetworked && network.matchRoom) {
            const state = network.matchRoom.state as any;
            if (state?.players) {
                state.players.forEach((player: any, sessionId: string) => {
                    entries.push({
                        sessionId,
                        displayName: player.displayName ?? "Player",
                        kills: player.kills ?? 0,
                        deaths: player.deaths ?? 0,
                        isLocal: sessionId === network.sessionId,
                    });
                });
            }
        } else {
            // Offline: local player + bots
            entries.push({
                sessionId: "local",
                displayName: "You",
                kills: this._localKills,
                deaths: this._localDeaths,
                isLocal: true,
            });
            if (this._botManager) {
                entries.push(...this._botManager.getScoreboardEntries());
            }
        }

        this._scoreboardUI.updatePlayers(entries);
    }

    /**
     * Sends the local player's position, rotation, and state to the server.
     * Throttling is handled by NetworkManager.sendPlayerUpdate().
     */
    private _sendNetworkUpdate(): void {
        if (!this._playerController || !this._weaponManager) return;

        const controllerPos = this._playerController.position;
        const groundY = controllerPos.y - PLAYER_STATS.capsuleHeight / 2;
        const weapon = this._weaponManager.activeWeapon;

        NetworkManager.getInstance().sendPlayerUpdate({
            x: controllerPos.x,
            y: groundY,
            z: controllerPos.z,
            yaw: this._playerController.yaw,
            pitch: this._playerController.pitch,
            state: this._playerController.state,
            weaponId: weapon.id,
            currentAmmo: weapon.currentAmmo,
            reserveAmmo: weapon.reserveAmmo,
            leanAmount: this._playerController.leanAmount,
        });
    }

    /**
     * Updates all remote player interpolation and remote projectile lifecycle.
     */
    private _updateRemotePlayers(): void {
        const engineDt = this._scene.getEngine().getDeltaTime();
        const dt = Math.min(engineDt / 1000, 0.05);
        const cullDistSq = ENTITY_CULL_DISTANCE * ENTITY_CULL_DISTANCE;
        const playerPos = this._playerController!.position;

        for (const remote of this._remotePlayers.values()) {
            const dx = playerPos.x - remote.position.x;
            const dz = playerPos.z - remote.position.z;
            const distSq = dx * dx + dz * dz;
            remote.setDormant(distSq > cullDistSq);
            remote.update(dt);
        }

        // Update remote projectiles (visual only, no hit detection)
        for (let i = this._remoteProjectiles.length - 1; i >= 0; i--) {
            const proj = this._remoteProjectiles[i];
            const expired = proj.update(dt);
            if (expired) {
                proj.dispose();
                this._remoteProjectiles.splice(i, 1);
            }
        }
    }

    // ─── Developer Console Commands ─────────────────────────────────

    /**
     * Registers all developer console commands.
     */
    private _registerConsoleCommands(): void {
        const reg = this._consoleRegistry!;
        const weaponIds = ["usp", "m9", "eagle", "ak47", "m4a1", "scar", "intervention", "50cal", "svd"];

        // Snapshot all mutable defaults for cl_reset
        const defaultPlayerSpeed = PLAYER_STATS.movementSpeed;
        const defaultPlayerJump = PLAYER_STATS.jumpHeight;
        const defaultFov = 1.22; // ~70 degrees
        const defaultGravity = -981;
        const defaultWeaponStats: Record<string, { damage: number; fireRate: number; projectileSpeed: number; projectileSize: number }> = {};
        for (const id of weaponIds) {
            const s = (WEAPON_STATS as any)[id];
            defaultWeaponStats[id] = {
                damage: s.damage,
                fireRate: s.fireRate,
                projectileSpeed: s.projectileSpeed,
                projectileSize: s.projectileSize,
            };
        }

        // ─── Player Commands ────────────────────────────────────
        reg.register({
            name: "cl_health",
            description: "Set player health",
            usage: "cl_health <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val)) return "Usage: cl_health <0-100>";
                this._playerController?.setHealth(val);
                this._crosshairHUD?.updateHealth(this._playerController?.currentHealth ?? 0);
                return `Health set to ${val}`;
            },
        });

        reg.register({
            name: "cl_god",
            description: "Toggle god mode (invincibility)",
            usage: "cl_god",
            params: [],
            execute: () => {
                this._godMode = !this._godMode;
                return `God mode ${this._godMode ? "ENABLED" : "DISABLED"}`;
            },
        });

        reg.register({
            name: "cl_noclip",
            description: "Toggle noclip fly mode",
            usage: "cl_noclip",
            params: [],
            execute: () => {
                this._playerController?.toggleNoclip();
                return `Noclip ${this._playerController?.isNoclip ? "ENABLED" : "DISABLED"}`;
            },
        });

        reg.register({
            name: "cl_speed",
            description: "Set movement speed (cm/s)",
            usage: "cl_speed <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val <= 0) return "Usage: cl_speed <positive number>";
                PLAYER_STATS.movementSpeed = val;
                return `Movement speed set to ${val} cm/s`;
            },
        });

        reg.register({
            name: "cl_jumpheight",
            description: "Set jump height (cm)",
            usage: "cl_jumpheight <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val <= 0) return "Usage: cl_jumpheight <positive number>";
                PLAYER_STATS.jumpHeight = val;
                return `Jump height set to ${val} cm`;
            },
        });

        reg.register({
            name: "cl_teleport",
            description: "Teleport to coordinates",
            usage: "cl_teleport <x> <y> <z>",
            params: [
                { name: "x", type: "number" },
                { name: "y", type: "number" },
                { name: "z", type: "number" },
            ],
            execute: (args) => {
                const x = parseFloat(args[0]);
                const y = parseFloat(args[1]);
                const z = parseFloat(args[2]);
                if (isNaN(x) || isNaN(y) || isNaN(z)) return "Usage: cl_teleport <x> <y> <z>";
                this._playerController?.teleport(new Vector3(x, y, z));
                return `Teleported to (${x}, ${y}, ${z})`;
            },
        });

        reg.register({
            name: "cl_respawn",
            description: "Force respawn at random spawn point",
            usage: "cl_respawn",
            params: [],
            execute: () => {
                if (!this._playerController) return "No player controller";
                const sp = SHIPMENT_SPAWN_POINTS[Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length)];
                const spawnPos = new Vector3(sp.x, sp.y, sp.z);
                this._playerController.respawn(spawnPos);
                this._weaponManager?.onRespawn();
                this._crosshairHUD?.updateHealth(this._playerController.currentHealth);
                this._crosshairHUD?.show();
                this._deathOverlay?.hide();
                return `Respawned at (${sp.x}, ${sp.y}, ${sp.z})`;
            },
        });

        reg.register({
            name: "cl_kill",
            description: "Kill self",
            usage: "cl_kill",
            params: [],
            execute: () => {
                if (!this._playerController) return "No player controller";
                this._playerController.setHealth(0);
                this._playerController.die();
                this._weaponManager?.onDeath();
                this._crosshairHUD?.hide();
                this._deathOverlay?.show("Console", "");
                this._localDeaths++;
                // Auto-respawn after 3s
                setTimeout(() => {
                    if (!this._playerController || this._isMatchEnded) return;
                    const sp = SHIPMENT_SPAWN_POINTS[Math.floor(Math.random() * SHIPMENT_SPAWN_POINTS.length)];
                    this._playerController.respawn(new Vector3(sp.x, sp.y, sp.z));
                    this._weaponManager?.onRespawn();
                    this._crosshairHUD?.updateHealth(this._playerController.currentHealth);
                    this._crosshairHUD?.show();
                    this._deathOverlay?.hide();
                }, 3000);
                return "You killed yourself";
            },
        });

        reg.register({
            name: "cl_pos",
            description: "Print current position",
            usage: "cl_pos",
            params: [],
            execute: () => {
                const pos = this._playerController?.position;
                if (!pos) return "No player controller";
                return `Position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
            },
        });

        // ─── Weapon Commands ────────────────────────────────────
        reg.register({
            name: "cl_giveweapon",
            description: "Give a weapon to active slot",
            usage: "cl_giveweapon <weapon_id>",
            params: [{ name: "weapon_id", type: "string", options: weaponIds }],
            execute: (args) => {
                const id = args[0] as any;
                if (!WEAPON_STATS[id as keyof typeof WEAPON_STATS]) {
                    return `Unknown weapon: ${args[0]}. Valid: ${weaponIds.join(", ")}`;
                }
                this._weaponManager?.replaceActiveWeapon(id);
                return `Equipped ${WEAPON_STATS[id as keyof typeof WEAPON_STATS].name}`;
            },
        });

        reg.register({
            name: "cl_giveammo",
            description: "Refill all ammo",
            usage: "cl_giveammo",
            params: [],
            execute: () => {
                this._weaponManager?.refillAllAmmo();
                return "All ammo refilled";
            },
        });

        reg.register({
            name: "cl_infiniteammo",
            description: "Toggle infinite ammo",
            usage: "cl_infiniteammo",
            params: [],
            execute: () => {
                this._infiniteAmmo = !this._infiniteAmmo;
                return `Infinite ammo ${this._infiniteAmmo ? "ENABLED" : "DISABLED"}`;
            },
        });

        reg.register({
            name: "cl_damage",
            description: "Override all weapon damage",
            usage: "cl_damage <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val < 0) return "Usage: cl_damage <positive number>";
                for (const id of weaponIds) {
                    (WEAPON_STATS as any)[id].damage = val;
                }
                return `All weapon damage set to ${val}`;
            },
        });

        reg.register({
            name: "cl_firerate",
            description: "Override all weapon fire rate (rounds/sec)",
            usage: "cl_firerate <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val <= 0) return "Usage: cl_firerate <positive number>";
                for (const id of weaponIds) {
                    (WEAPON_STATS as any)[id].fireRate = val;
                }
                return `All weapon fire rate set to ${val} rounds/sec`;
            },
        });

        reg.register({
            name: "cl_projectilespeed",
            description: "Override projectile speed (cm/s)",
            usage: "cl_projectilespeed <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val <= 0) return "Usage: cl_projectilespeed <positive number>";
                for (const id of weaponIds) {
                    (WEAPON_STATS as any)[id].projectileSpeed = val;
                }
                return `Projectile speed set to ${val} cm/s`;
            },
        });

        reg.register({
            name: "cl_projectilesize",
            description: "Override projectile size (cm)",
            usage: "cl_projectilesize <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val <= 0) return "Usage: cl_projectilesize <positive number>";
                for (const id of weaponIds) {
                    (WEAPON_STATS as any)[id].projectileSize = val;
                }
                return `Projectile size set to ${val} cm`;
            },
        });

        // ─── Physics Commands ───────────────────────────────────
        reg.register({
            name: "cl_gravity",
            description: "Set gravity Y value (cm/s²)",
            usage: "cl_gravity <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val)) return "Usage: cl_gravity <number> (default: -981)";
                this._scene.getPhysicsEngine()?.setGravity(new Vector3(0, val, 0));
                return `Gravity set to ${val} cm/s²`;
            },
        });

        reg.register({
            name: "cl_timescale",
            description: "Set game time scale",
            usage: "cl_timescale <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val < 0.1 || val > 5.0) return "Usage: cl_timescale <0.1-5.0>";
                this._timeScale = val;
                return `Time scale set to ${val}`;
            },
        });

        // ─── Bot Commands ───────────────────────────────────────
        reg.register({
            name: "cl_bot_kill",
            description: "Kill one or all bots",
            usage: "cl_bot_kill [name]",
            params: [{ name: "name", type: "string", optional: true }],
            execute: (args) => {
                if (!this._botManager) return "No bots active";
                let count = 0;
                for (const bot of this._botManager.bots) {
                    if (bot.isDead) continue;
                    if (args[0] && bot.displayName.toLowerCase() !== args[0].toLowerCase()) continue;
                    bot.takeDamage(9999);
                    count++;
                }
                return count > 0 ? `Killed ${count} bot(s)` : "No matching bots found";
            },
        });

        reg.register({
            name: "cl_bot_health",
            description: "Set all bots' health",
            usage: "cl_bot_health <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val)) return "Usage: cl_bot_health <0-100>";
                if (!this._botManager) return "No bots active";
                for (const bot of this._botManager.bots) {
                    if (!bot.isDead) bot.setHealth(val);
                }
                return `All bot health set to ${val}`;
            },
        });

        reg.register({
            name: "cl_bot_freeze",
            description: "Toggle bot AI freeze (idle, no pathfinding, no firing)",
            usage: "cl_bot_freeze",
            params: [],
            execute: () => {
                if (!this._botManager) return "No bots active";
                const frozen = this._botManager.toggleFreezeAll();
                return `Bot AI ${frozen ? "FROZEN" : "UNFROZEN"}`;
            },
        });

        reg.register({
            name: "cl_bot_respawn",
            description: "Force respawn all dead bots",
            usage: "cl_bot_respawn",
            params: [],
            execute: () => {
                if (!this._botManager) return "No bots active";
                let count = 0;
                for (const bot of this._botManager.bots) {
                    if (bot.isDead) {
                        bot.forceRespawn();
                        count++;
                    }
                }
                return count > 0 ? `${count} bot(s) will respawn shortly` : "No dead bots";
            },
        });

        reg.register({
            name: "cl_bot_remove",
            description: "Remove a specific bot by name, or the last bot if no name given",
            usage: "cl_bot_remove [name]",
            params: [{ name: "name", type: "string", optional: true }],
            execute: (args) => {
                if (!this._botManager) return "No bots active";
                const bots = this._botManager.bots;
                if (bots.length === 0) return "No bots to remove";

                let targetSessionId: string | null = null;
                if (args[0]) {
                    const target = bots.find(
                        b => b.displayName.toLowerCase() === args[0].toLowerCase()
                    );
                    if (!target) return `No bot named "${args[0]}"`;
                    targetSessionId = target.sessionId;
                } else {
                    targetSessionId = bots[bots.length - 1].sessionId;
                }

                const name = this._botManager.removeBot(targetSessionId);
                return name ? `Removed bot "${name}"` : "Failed to remove bot";
            },
        });

        reg.register({
            name: "cl_bot_ragdoll",
            description: "Toggle ragdoll on all alive bots (collapse / stand up)",
            usage: "cl_bot_ragdoll",
            params: [],
            execute: () => {
                if (!this._botManager) return "No bots active";
                // Check current state from first alive bot with ragdoll
                let isCurrentlyRagdolled = false;
                for (const bot of this._botManager.bots) {
                    if (bot.isDead) continue;
                    const r = this._botManager.getRemotePlayer(bot.sessionId);
                    if (r?.characterModel?.isRagdolling) { isCurrentlyRagdolled = true; break; }
                }
                let toggled = 0;
                if (isCurrentlyRagdolled) {
                    // Deactivate ragdoll, unfreeze bots
                    this._botManager.ragdollFreezeAll = false;
                    for (const bot of this._botManager.bots) {
                        if (bot.isDead) continue;
                        const remote = this._botManager.getRemotePlayer(bot.sessionId);
                        if (!remote?.characterModel?.isRagdolling) continue;
                        const cm = remote.characterModel;
                        cm.deactivateRagdoll();
                        cm.setVisible(true);
                        cm.setState("Idle");
                        toggled++;
                    }
                } else {
                    // Activate ragdoll, freeze bots so AI doesn't fight it
                    this._botManager.ragdollFreezeAll = true;
                    for (const bot of this._botManager.bots) {
                        if (bot.isDead) continue;
                        const remote = this._botManager.getRemotePlayer(bot.sessionId);
                        if (!remote?.characterModel?.isRagdollInitialized) continue;
                        remote.characterModel.activateRagdoll(Vector3.Down(), 0);
                        toggled++;
                    }
                }
                return toggled > 0
                    ? `Ragdoll ${isCurrentlyRagdolled ? "OFF" : "ON"} for ${toggled} bot(s)`
                    : "No bots with ragdoll available";
            },
        });

        reg.register({
            name: "cl_bot_info",
            description: "Print all bot info",
            usage: "cl_bot_info",
            params: [],
            execute: () => {
                if (!this._botManager) return "No bots active";
                const lines: string[] = [];
                for (const bot of this._botManager.bots) {
                    const info = this._botManager.getBotInfo(bot.sessionId);
                    if (info) {
                        lines.push(
                            `${info.displayName}: HP=${info.health} State=${info.state} Weapon=${info.weaponId} Pos=(${info.x.toFixed(0)}, ${info.y.toFixed(0)}, ${info.z.toFixed(0)})`
                        );
                    }
                }
                return lines.length > 0 ? lines.join("\n") : "No bots";
            },
        });

        reg.register({
            name: "cl_add_bot",
            description: "Add a bot to the match",
            usage: "cl_add_bot [weapon_id]",
            params: [{ name: "weapon_id", type: "string", options: weaponIds, optional: true }],
            execute: (args) => {
                if (!this._botManager) return "No bot manager active";
                const weaponId = args[0] as any;
                if (weaponId && !WEAPON_STATS[weaponId as keyof typeof WEAPON_STATS]) {
                    return `Unknown weapon: ${weaponId}. Valid: ${weaponIds.join(", ")}`;
                }
                const name = this._botManager.addBot(weaponId || undefined);
                return `Added bot: ${name}`;
            },
        });

        // ─── Test Dummy Commands ────────────────────────────────
        reg.register({
            name: "cl_test_dummy",
            description: "Spawn a ragdolled test dummy at coordinates",
            usage: "cl_test_dummy <x> <y> <z>",
            params: [
                { name: "x", type: "number" },
                { name: "y", type: "number" },
                { name: "z", type: "number" },
            ],
            execute: (args) => {
                const x = parseFloat(args[0]);
                const y = parseFloat(args[1]);
                const z = parseFloat(args[2]);
                if (isNaN(x) || isNaN(y) || isNaN(z)) return "Usage: cl_test_dummy <x> <y> <z>";

                const dummyId = `test_dummy_${this._testDummies.size}`;
                const groundY = y - PLAYER_STATS.capsuleHeight / 2;
                const remote = new RemotePlayer(
                    this._scene,
                    dummyId,
                    "Test Dummy",
                    x,
                    groundY,
                    z,
                );

                this._testDummies.set(dummyId, remote);

                // Poll until character model is loaded, then activate ragdoll
                let pollCount = 0;
                const poll = () => {
                    pollCount++;
                    if (remote.characterModel) {
                        remote.dieAsDummy();
                        console.log(`[MatchScene] Test dummy "${dummyId}" ragdolled at (${x}, ${y}, ${z}) after ${pollCount} polls`);
                    } else if (pollCount < 100) {
                        // Retry every 100ms, up to 10 seconds
                        setTimeout(poll, 100);
                    } else {
                        console.warn(`[MatchScene] Test dummy "${dummyId}" model never loaded`);
                    }
                };
                setTimeout(poll, 100);

                return `Spawning test dummy at (${x}, ${y}, ${z}) — waiting for model to load...`;
            },
        });

        reg.register({
            name: "cl_clear_dummies",
            description: "Remove all test dummies",
            usage: "cl_clear_dummies",
            params: [],
            execute: () => {
                const count = this._testDummies.size;
                for (const remote of this._testDummies.values()) {
                    remote.dispose();
                }
                this._testDummies.clear();
                return count > 0 ? `Removed ${count} test dummy(s)` : "No test dummies";
            },
        });

        reg.register({
            name: "cl_show_colliders",
            description: "Toggle collider visualization for ALL physics bodies + entity hitboxes",
            usage: "cl_show_colliders",
            params: [],
            execute: () => {
                if (this._physicsViewer) {
                    // ─── Turn OFF ───
                    this._physicsViewer.dispose();
                    this._physicsViewer = null;

                    // Remove per-frame observer
                    if (this._colliderDebugObserver) {
                        this._scene.onAfterRenderObservable.remove(this._colliderDebugObserver);
                        this._colliderDebugObserver = null;
                    }
                    this._colliderDebugTrackedBodies.clear();
                    this._colliderDebugTrackedRagdolls.clear();

                    // Restore capsule meshes to original state
                    for (const [mesh, state] of this._debugCapsuleOriginalState) {
                        mesh.isVisible = state.isVisible;
                        mesh.material = state.material;
                    }
                    this._debugCapsuleOriginalState.clear();
                    for (const mat of this._debugCapsuleMaterials) mat.dispose();
                    this._debugCapsuleMaterials = [];

                    // Hide ragdoll debug on all entities
                    const hideRagdoll = (remote: RemotePlayer) => {
                        if (remote.characterModel?.debugCollidersEnabled) {
                            remote.characterModel.setDebugColliders(false);
                        }
                    };
                    for (const r of this._testDummies.values()) hideRagdoll(r);
                    if (this._botManager) {
                        const remotes = (this._botManager as any)._remotes as Map<string, RemotePlayer> | undefined;
                        if (remotes) for (const r of remotes.values()) hideRagdoll(r);
                    }
                    return "Colliders HIDDEN";
                }

                // ─── Turn ON ───
                this._physicsViewer = new PhysicsViewer(this._scene);
                this._colliderDebugTrackedBodies.clear();
                this._colliderDebugTrackedRagdolls.clear();
                let physCount = 0;

                // 1) Show all physics bodies (map geometry, props, etc.)
                for (const mesh of this._scene.meshes) {
                    if (mesh.physicsBody) {
                        this._physicsViewer.showBody(mesh.physicsBody);
                        this._colliderDebugTrackedBodies.add(mesh.physicsBody);
                        physCount++;
                    }
                }

                // 2) Show remote player / bot capsule hitboxes as cyan wireframes
                const cyanMat = new StandardMaterial("mat_debug_capsule", this._scene);
                cyanMat.emissiveColor = new Color3(0, 1, 1);
                cyanMat.disableLighting = true;
                cyanMat.wireframe = true;
                this._debugCapsuleMaterials.push(cyanMat);

                let capsuleCount = 0;
                for (const mesh of this._scene.meshes) {
                    if (mesh.name.startsWith("remote_body_")) {
                        this._debugCapsuleOriginalState.set(mesh, {
                            isVisible: mesh.isVisible,
                            material: mesh.material,
                        });
                        mesh.isVisible = true;
                        mesh.material = cyanMat;
                        capsuleCount++;
                    }
                }

                // 3) Show ragdoll bone debug (GREEN physics bodies, RED mesh hitboxes)
                let ragdollCount = 0;
                const showRagdoll = (remote: RemotePlayer, id: string) => {
                    const cm = remote.characterModel;
                    if (cm?.isRagdolling && !cm.debugCollidersEnabled) {
                        cm.setDebugColliders(true);
                        this._colliderDebugTrackedRagdolls.add(id);
                        ragdollCount++;
                    }
                };
                for (const [id, r] of this._testDummies) showRagdoll(r, id);
                if (this._botManager) {
                    const remotes = (this._botManager as any)._remotes as Map<string, RemotePlayer> | undefined;
                    if (remotes) for (const [id, r] of remotes) showRagdoll(r, id);
                }

                // 4) Per-frame observer: auto-detect new physics bodies + ragdolls
                this._colliderDebugObserver = this._scene.onAfterRenderObservable.add(() => {
                    if (!this._physicsViewer) return;

                    // Check for new physics bodies on meshes
                    for (const mesh of this._scene.meshes) {
                        if (mesh.physicsBody && !this._colliderDebugTrackedBodies.has(mesh.physicsBody)) {
                            this._physicsViewer.showBody(mesh.physicsBody);
                            this._colliderDebugTrackedBodies.add(mesh.physicsBody);
                        }
                    }

                    // Check for new capsule meshes (e.g. newly spawned bots)
                    const cMat = this._debugCapsuleMaterials[0];
                    if (cMat) {
                        for (const mesh of this._scene.meshes) {
                            if (mesh.name.startsWith("remote_body_") && !this._debugCapsuleOriginalState.has(mesh)) {
                                this._debugCapsuleOriginalState.set(mesh, {
                                    isVisible: mesh.isVisible,
                                    material: mesh.material,
                                });
                                mesh.isVisible = true;
                                mesh.material = cMat;
                            }
                        }
                    }

                    // Check for new ragdolls
                    const checkRagdoll = (remote: RemotePlayer, id: string) => {
                        const cm = remote.characterModel;
                        if (cm?.isRagdolling && !this._colliderDebugTrackedRagdolls.has(id)) {
                            cm.setDebugColliders(true);
                            this._colliderDebugTrackedRagdolls.add(id);
                        }
                    };
                    for (const [id, r] of this._testDummies) checkRagdoll(r, id);
                    if (this._botManager) {
                        const remotes = (this._botManager as any)._remotes as Map<string, RemotePlayer> | undefined;
                        if (remotes) for (const [id, r] of remotes) checkRagdoll(r, id);
                    }
                });

                return `Colliders ON — ${physCount} physics (white), ${capsuleCount} capsules (cyan), ${ragdollCount} ragdolls (green/red). Auto-refresh active.`;
            },
        });

        // ─── UI/Debug Commands ──────────────────────────────────
        reg.register({
            name: "cl_debug",
            description: "Toggle debug overlay",
            usage: "cl_debug",
            params: [],
            execute: () => {
                if (this._debugOverlayUI?.isVisible) {
                    this._debugOverlayUI.hide();
                    localStorage.setItem(DEBUG_MODE_KEY, "false");
                    return "Debug overlay HIDDEN";
                } else {
                    this._debugOverlayUI?.show();
                    localStorage.setItem(DEBUG_MODE_KEY, "true");
                    return "Debug overlay SHOWN";
                }
            },
        });

        reg.register({
            name: "cl_navmesh",
            description: "Toggle navmesh visualization",
            usage: "cl_navmesh",
            params: [],
            execute: () => {
                this._toggleDebugNavMesh();
                return `Navmesh visualization ${this._debugNavMesh ? "SHOWN" : "HIDDEN"}`;
            },
        });

        reg.register({
            name: "cl_fps",
            description: "Print current FPS",
            usage: "cl_fps",
            params: [],
            execute: () => {
                const fps = this._scene.getEngine().getFps();
                return `FPS: ${fps.toFixed(1)}`;
            },
        });

        reg.register({
            name: "cl_hud",
            description: "Show/hide crosshair HUD",
            usage: "cl_hud <0|1>",
            params: [{ name: "enabled", type: "number", options: ["0", "1"] }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (val === 1) { this._crosshairHUD?.show(); return "HUD shown"; }
                if (val === 0) { this._crosshairHUD?.hide(); return "HUD hidden"; }
                return "Usage: cl_hud <0|1>";
            },
        });

        reg.register({
            name: "cl_killfeed",
            description: "Show/hide kill feed",
            usage: "cl_killfeed <0|1>",
            params: [{ name: "enabled", type: "number", options: ["0", "1"] }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (val === 1) { this._killFeedUI?.show(); return "Kill feed shown"; }
                if (val === 0) { this._killFeedUI?.hide(); return "Kill feed hidden"; }
                return "Usage: cl_killfeed <0|1>";
            },
        });

        reg.register({
            name: "cl_minimap",
            description: "Show/hide minimap",
            usage: "cl_minimap <0|1>",
            params: [{ name: "enabled", type: "number", options: ["0", "1"] }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (val === 1) { this._minimapUI?.show(); return "Minimap shown"; }
                if (val === 0) { this._minimapUI?.hide(); return "Minimap hidden"; }
                return "Usage: cl_minimap <0|1>";
            },
        });

        // ─── Audio Commands ─────────────────────────────────────
        reg.register({
            name: "cl_volume",
            description: "Set master volume",
            usage: "cl_volume <0.0-1.0>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val < 0 || val > 1) return "Usage: cl_volume <0.0-1.0>";
                this._audioManager?.setMasterVolume(val);
                this._savedVolume = val;
                return `Volume set to ${val}`;
            },
        });

        reg.register({
            name: "cl_mute",
            description: "Toggle mute",
            usage: "cl_mute",
            params: [],
            execute: () => {
                this._isMuted = !this._isMuted;
                if (this._isMuted) {
                    this._audioManager?.setMasterVolume(0);
                    return "Audio MUTED";
                } else {
                    this._audioManager?.setMasterVolume(this._savedVolume);
                    return "Audio UNMUTED";
                }
            },
        });

        // ─── Graphics Commands ──────────────────────────────────
        reg.register({
            name: "cl_fov",
            description: "Set camera FOV (degrees)",
            usage: "cl_fov <60-120>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val < 30 || val > 150) return "Usage: cl_fov <30-150>";
                if (this._playerController) {
                    this._playerController.camera.fov = val * Math.PI / 180;
                }
                return `FOV set to ${val} degrees`;
            },
        });

        const gfx = GraphicsSettings.getInstance();

        reg.register({
            name: "cl_bloom",
            description: "Toggle bloom",
            usage: "cl_bloom <0|1>",
            params: [{ name: "enabled", type: "number", options: ["0", "1"] }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (val !== 0 && val !== 1) return "Usage: cl_bloom <0|1>";
                gfx.set("bloomEnabled", val === 1);
                return `Bloom ${val === 1 ? "ENABLED" : "DISABLED"}`;
            },
        });

        reg.register({
            name: "cl_fxaa",
            description: "Toggle FXAA",
            usage: "cl_fxaa <0|1>",
            params: [{ name: "enabled", type: "number", options: ["0", "1"] }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (val !== 0 && val !== 1) return "Usage: cl_fxaa <0|1>";
                gfx.set("fxaaEnabled", val === 1);
                return `FXAA ${val === 1 ? "ENABLED" : "DISABLED"}`;
            },
        });

        reg.register({
            name: "cl_msaa",
            description: "Set MSAA samples",
            usage: "cl_msaa <1|2|4|8>",
            params: [{ name: "samples", type: "number", options: ["1", "2", "4", "8"] }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (![1, 2, 4, 8].includes(val)) return "Usage: cl_msaa <1|2|4|8>";
                gfx.set("msaaSamples", val);
                return `MSAA set to ${val}x`;
            },
        });

        reg.register({
            name: "cl_exposure",
            description: "Set exposure",
            usage: "cl_exposure <0.5-3.0>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val < 0.5 || val > 3.0) return "Usage: cl_exposure <0.5-3.0>";
                gfx.set("exposure", val);
                return `Exposure set to ${val}`;
            },
        });

        reg.register({
            name: "cl_renderscale",
            description: "Set render scale (%)",
            usage: "cl_renderscale <25-100>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (isNaN(val) || val < 25 || val > 100) return "Usage: cl_renderscale <25-100>";
                gfx.set("renderScale", val);
                return `Render scale set to ${val}%`;
            },
        });

        // ─── Match Commands ─────────────────────────────────────
        reg.register({
            name: "cl_matchtime",
            description: "Set match time remaining (seconds)",
            usage: "cl_matchtime <seconds>",
            params: [{ name: "seconds", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val < 0) return "Usage: cl_matchtime <seconds>";
                this._matchTimeRemaining = val;
                return `Match time set to ${val}s`;
            },
        });

        reg.register({
            name: "cl_resetkills",
            description: "Reset kill/death counters",
            usage: "cl_resetkills",
            params: [],
            execute: () => {
                this._localKills = 0;
                this._localDeaths = 0;
                return "Kill/death counters reset";
            },
        });

        // ─── Weapon Drop Commands ───────────────────────────────
        reg.register({
            name: "cl_dropweapon",
            description: "Drop a weapon at player position",
            usage: "cl_dropweapon [weapon_id]",
            params: [{ name: "weapon_id", type: "string", options: weaponIds, optional: true }],
            execute: (args) => {
                if (!this._playerController || !this._weaponDropManager) return "Not available";
                const weaponId = (args[0] || this._weaponManager?.activeWeapon.id || "usp") as any;
                if (!WEAPON_STATS[weaponId as keyof typeof WEAPON_STATS]) {
                    return `Unknown weapon: ${weaponId}. Valid: ${weaponIds.join(", ")}`;
                }
                const pos = this._playerController.position.clone();
                pos.y += 50;
                this._weaponDropManager.spawnDrop(weaponId, pos, this._playerController.yaw);
                return `Dropped ${WEAPON_STATS[weaponId as keyof typeof WEAPON_STATS].name}`;
            },
        });

        reg.register({
            name: "cl_cleardrops",
            description: "Remove all weapon drops",
            usage: "cl_cleardrops",
            params: [],
            execute: () => {
                this._weaponDropManager?.dispose();
                this._weaponDropManager = new WeaponDropManager(this._scene);
                return "All weapon drops cleared";
            },
        });

        reg.register({
            name: "cl_weapondrops",
            description: "Toggle weapon drops on death",
            usage: "cl_weapondrops",
            params: [],
            execute: () => {
                if (!this._weaponDropManager) return "Not available";
                this._weaponDropManager.enabled = !this._weaponDropManager.enabled;
                return `Weapon drops ${this._weaponDropManager.enabled ? "enabled" : "disabled"}`;
            },
        });

        // ─── Progression Commands ───────────────────────────────
        reg.register({
            name: "cl_setlevel",
            description: "Set player level",
            usage: "cl_setlevel <1-30>",
            params: [{ name: "level", type: "number" }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (isNaN(val) || val < 1 || val > 30) return "Usage: cl_setlevel <1-30>";
                localStorage.setItem("fps_player_level", String(val));
                localStorage.setItem("fps_player_xp", "0");
                return `Level set to ${val} (takes effect on next load)`;
            },
        });

        reg.register({
            name: "cl_addxp",
            description: "Add XP",
            usage: "cl_addxp <amount>",
            params: [{ name: "amount", type: "number" }],
            execute: (args) => {
                const val = parseInt(args[0], 10);
                if (isNaN(val) || val <= 0) return "Usage: cl_addxp <positive number>";
                const result = ProgressionManager.getInstance().addXP(val);
                this._xpBarUI?.onXPGained(result.leveledUp);
                if (result.leveledUp) {
                    this._levelUpUI?.show(result.newLevel, result.unlockedWeapons);
                    this._audioManager?.playSound("levelup.mp3");
                }
                return `Added ${val} XP. Level: ${result.newLevel}, XP: ${result.newXP}`;
            },
        });

        reg.register({
            name: "cl_resetprogression",
            description: "Reset XP and level to 0",
            usage: "cl_resetprogression",
            params: [],
            execute: () => {
                localStorage.setItem("fps_player_level", "1");
                localStorage.setItem("fps_player_xp", "0");
                return "Progression reset to level 1 (takes effect on next load)";
            },
        });

        // ─── Meta Commands ──────────────────────────────────────
        reg.register({
            name: "help",
            description: "List all commands or show help for one",
            usage: "help [command]",
            params: [{ name: "command", type: "string", optional: true }],
            execute: (args) => {
                if (args[0]) {
                    const cmd = reg.getCommand(args[0]);
                    if (!cmd) return `Unknown command: ${args[0]}`;
                    return `${cmd.usage}\n  ${cmd.description}`;
                }
                const cmds = reg.getAllCommands();
                const lines = cmds.map(c => `  ${c.name.padEnd(24)} ${c.description}`);
                return `Available commands (${cmds.length}):\n${lines.join("\n")}`;
            },
        });

        reg.register({
            name: "clear",
            description: "Clear console output",
            usage: "clear",
            params: [],
            execute: () => {
                if (this._consoleUI) {
                    (this._consoleUI as any)._logLines = [];
                    (this._consoleUI as any)._logTextBlock.text = "";
                }
                return "";
            },
        });

        reg.register({
            name: "cl_reset",
            description: "Reset all modified stats to defaults",
            usage: "cl_reset",
            params: [],
            execute: () => {
                // Player stats
                PLAYER_STATS.movementSpeed = defaultPlayerSpeed;
                PLAYER_STATS.jumpHeight = defaultPlayerJump;

                // Weapon stats
                for (const id of weaponIds) {
                    const s = (WEAPON_STATS as any)[id];
                    const d = defaultWeaponStats[id];
                    s.damage = d.damage;
                    s.fireRate = d.fireRate;
                    s.projectileSpeed = d.projectileSpeed;
                    s.projectileSize = d.projectileSize;
                }

                // Physics
                this._scene.getPhysicsEngine()?.setGravity(new Vector3(0, defaultGravity, 0));
                this._timeScale = 1.0;

                // Camera FOV
                if (this._playerController) {
                    this._playerController.camera.fov = defaultFov;
                }

                // Toggle flags
                this._godMode = false;
                this._infiniteAmmo = false;

                // Unfreeze bots
                if (this._botManager) {
                    for (const bot of this._botManager.bots) {
                        bot.frozen = false;
                    }
                }

                return "All stats reset to defaults";
            },
        });

        reg.register({
            name: "cl_sensitivity",
            description: "Set mouse sensitivity",
            usage: "cl_sensitivity <value>",
            params: [{ name: "value", type: "number" }],
            execute: (args) => {
                const val = parseFloat(args[0]);
                if (isNaN(val) || val <= 0) return "Usage: cl_sensitivity <positive number>";
                if (this._inputManager) {
                    this._inputManager.sensitivity = val;
                }
                return `Mouse sensitivity set to ${val}`;
            },
        });
    }

    /**
     * Updates the weapon drop system: proximity checks, pickup, prompt.
     * @param dt - Delta time in seconds.
     */
    private _updateWeaponDrops(dt: number): void {
        if (!this._weaponDropManager || !this._playerController || !this._weaponManager || !this._inputManager) return;
        if (this._playerController.currentHealth <= 0) return;

        this._weaponDropManager.update(
            dt,
            this._playerController.position,
            this._weaponManager.activeWeapon.id,
            this._weaponManager.slot1WeaponId,
            this._weaponManager.slot2WeaponId,
            this._inputManager.interact,
            this._playerController.camera,
        );
    }

    private _updateWeaponSystem(): void {
        if (!this._weaponManager || !this._inputManager || !this._playerController || !this._crosshairHUD) return;

        // Don't process weapon input when player is dead
        if (this._playerController.currentHealth <= 0) return;

        // Infinite ammo: refill every frame
        if (this._infiniteAmmo) {
            this._weaponManager.refillAllAmmo();
        }

        const engineDt = this._scene.getEngine().getDeltaTime();
        const dt = Math.min(engineDt / 1000, 0.05);

        const prevAmmo = this._weaponManager.activeWeapon.currentAmmo;
        this._weaponManager.update(dt, this._inputManager, this._playerController.camera);
        const newAmmo = this._weaponManager.activeWeapon.currentAmmo;

        if (newAmmo < prevAmmo) {
            this._weaponSway?.triggerRecoil();
            // Mirror clone fires when player fires
            this._mirrorClone?.triggerFire(this._weaponManager.activeWeapon.stats.audioFile);
        }

        if (this._weaponSway) {
            this._weaponSway.update(dt, this._playerController.state, this._playerController.verticalVelocity, this._playerController.leanAmount);
        }

        const weapon = this._weaponManager.activeWeapon;
        this._crosshairHUD.updateAmmo(weapon.currentAmmo, weapon.reserveAmmo);
        this._crosshairHUD.updateWeaponName(weapon.name);
        this._crosshairHUD.updateHealth(this._playerController.currentHealth);
    }

    // ─── ImGui Panel Context Builders ────────────────────────────

    /**
     * Builds the context object for the Player ImGui panel.
     * Uses closures referencing private MatchScene fields.
     */
    private _buildPlayerPanelContext(): PlayerPanelContext {
        return {
            getHealth: () => this._playerController?.currentHealth ?? 0,
            setHealth: (v) => {
                this._playerController?.setHealth(v);
                this._crosshairHUD?.updateHealth(this._playerController?.currentHealth ?? 0);
            },
            getPosition: () => {
                const p = this._playerController?.position;
                return p ? { x: p.x, y: p.y, z: p.z } : { x: 0, y: 0, z: 0 };
            },
            teleport: (x, y, z) => {
                this._playerController?.teleport(new Vector3(x, y, z));
            },
            getSpeed: () => PLAYER_STATS.movementSpeed,
            setSpeed: (v) => { PLAYER_STATS.movementSpeed = v; },
            getJumpHeight: () => PLAYER_STATS.jumpHeight,
            setJumpHeight: (v) => { PLAYER_STATS.jumpHeight = v; },
            getGodMode: () => this._godMode,
            setGodMode: (v) => { this._godMode = v; },
            getNoclip: () => this._playerController?.isNoclip ?? false,
            toggleNoclip: () => { this._playerController?.toggleNoclip(); },
            getInfiniteAmmo: () => this._infiniteAmmo,
            setInfiniteAmmo: (v) => { this._infiniteAmmo = v; },
            getFov: () => {
                const cam = this._playerController?.camera;
                return cam ? cam.fov * 180 / Math.PI : 70;
            },
            setFov: (v) => {
                if (this._playerController) {
                    this._playerController.camera.fov = v * Math.PI / 180;
                }
            },
            kill: () => { this._consoleRegistry?.execute("cl_kill"); },
            respawn: () => { this._consoleRegistry?.execute("cl_respawn"); },
        };
    }

    /**
     * Builds the context object for the Bots ImGui panel.
     * Uses closures referencing private MatchScene fields.
     */
    private _buildBotPanelContext(): BotPanelContext {
        const bm = this._botManager!;
        const diffKey = localStorage.getItem("fps_bot_difficulty") || DEFAULT_BOT_DIFFICULTY;
        const diff = BOT_DIFFICULTIES[diffKey] ?? BOT_DIFFICULTIES["medium"];
        const allIds = Object.keys(WEAPON_STATS);
        const allNames = allIds.map(id => WEAPON_STATS[id as WeaponId].name);

        return {
            getBotCount: () => bm.bots.length,
            getBotInfos: () => {
                const infos: BotInfo[] = [];
                for (const bot of bm.bots) {
                    const pos = bot.position;
                    const weaponName = WEAPON_STATS[bot.weaponId]?.name ?? bot.weaponId;
                    infos.push({
                        sessionId: bot.sessionId,
                        name: bot.displayName,
                        health: bot.health,
                        state: bot.isDead ? "Dead" : bot.state,
                        weapon: weaponName,
                        weaponId: bot.weaponId,
                        x: pos.x,
                        y: pos.y,
                        z: pos.z,
                        isDead: bot.isDead,
                        isFrozen: bot.manualFrozen,
                        kills: bot.kills,
                        deaths: bot.deaths,
                    });
                }
                return infos;
            },
            setBotHealth: (v) => {
                for (const bot of bm.bots) {
                    if (!bot.isDead) bot.setHealth(v);
                }
            },
            killAllBots: () => { this._consoleRegistry?.execute("cl_bot_kill"); },
            respawnBots: () => { this._consoleRegistry?.execute("cl_bot_respawn"); },
            isFrozen: () => bm.manualFreezeAll,
            toggleFreeze: () => { bm.toggleFreezeAll(); },
            isRagdolled: () => bm.ragdollFreezeAll,
            toggleRagdoll: () => { this._consoleRegistry?.execute("cl_bot_ragdoll"); },
            addBot: () => { bm.addBot(); },
            removeBot: (sessionId) => { bm.removeBot(sessionId); },
            removeLastBot: () => {
                const bots = bm.bots;
                if (bots.length > 0) bm.removeBot(bots[bots.length - 1].sessionId);
            },
            getAimAccuracy: () => diff.aimAccuracy,
            setAimAccuracy: (v) => { diff.aimAccuracy = v; },
            getReactionTime: () => diff.reactionTimeMs,
            setReactionTime: (v) => { diff.reactionTimeMs = v; },
            getFieldOfView: () => diff.fieldOfView,
            setFieldOfView: (v) => { diff.fieldOfView = v; },
            getEngageRange: () => diff.engageRange,
            setEngageRange: (v) => { diff.engageRange = v; },
            getFireInterval: () => diff.fireIntervalMs,
            setFireInterval: (v) => { diff.fireIntervalMs = v; },
            // Per-bot actions
            setBotIndividualHealth: (sessionId, v) => {
                const bot = bm.bots.find(b => b.sessionId === sessionId);
                if (bot && !bot.isDead) bot.setHealth(v);
            },
            killBot: (sessionId) => {
                const bot = bm.bots.find(b => b.sessionId === sessionId);
                if (bot && !bot.isDead) bot.takeDamage(9999);
            },
            respawnBot: (sessionId) => {
                const bot = bm.bots.find(b => b.sessionId === sessionId);
                if (bot && bot.isDead) bot.forceRespawn();
            },
            freezeBot: (sessionId, manualFrozen) => {
                const bot = bm.bots.find(b => b.sessionId === sessionId);
                if (bot) bot.manualFrozen = manualFrozen;
            },
            teleportBot: (sessionId, x, y, z) => {
                const bot = bm.bots.find(b => b.sessionId === sessionId);
                if (bot) bot.teleport(x, y, z);
            },
            setBotWeapon: (sessionId, weaponId) => {
                const bot = bm.bots.find(b => b.sessionId === sessionId);
                if (bot) bot.setWeapon(weaponId as WeaponId);
            },
            allWeaponIds: allIds,
            allWeaponNames: allNames,
        };
    }

    /**
     * Builds context for the Weapons ImGui tab.
     */
    private _buildWeaponsTabContext(): WeaponsTabContext {
        const wm = this._weaponManager!;
        const sway = this._weaponSway;
        const allIds = Object.keys(WEAPON_STATS);
        const allNames = allIds.map(id => WEAPON_STATS[id as WeaponId].name);
        return {
            getActiveWeaponName: () => wm.activeWeapon.name,
            getActiveWeaponId: () => wm.activeWeapon.id,
            getActiveSlot: () => wm.activeSlot,
            getSlot1Id: () => wm.slot1WeaponId,
            getSlot2Id: () => wm.slot2WeaponId,
            getCurrentAmmo: () => wm.activeWeapon.currentAmmo,
            getReserveAmmo: () => wm.activeWeapon.reserveAmmo,
            getIsReloading: () => wm.activeWeapon.isReloading,
            getDamage: () => wm.activeWeapon.stats.damage,
            setDamage: (v) => { wm.activeWeapon.stats.damage = v; },
            getFireRate: () => wm.activeWeapon.stats.fireRate,
            setFireRate: (v) => { wm.activeWeapon.stats.fireRate = v; },
            getProjectileSpeed: () => wm.activeWeapon.stats.projectileSpeed,
            setProjectileSpeed: (v) => { wm.activeWeapon.stats.projectileSpeed = v; },
            getMagSize: () => wm.activeWeapon.stats.magazineSize,
            setMagSize: (v) => { wm.activeWeapon.stats.magazineSize = v; },
            getReloadTime: () => wm.activeWeapon.stats.reloadTime,
            setReloadTime: (v) => { wm.activeWeapon.stats.reloadTime = v; },
            refillAmmo: () => { wm.refillAllAmmo(); },
            switchWeapon: (id) => { wm.replaceActiveWeapon(id as WeaponId); },
            getIdleSwayX: () => sway?.idleSwayX ?? 0.06,
            setIdleSwayX: (v) => { if (sway) sway.idleSwayX = v; },
            getIdleSwayY: () => sway?.idleSwayY ?? 0.04,
            setIdleSwayY: (v) => { if (sway) sway.idleSwayY = v; },
            getWalkSwingX: () => sway?.walkSwingX ?? 0.45,
            setWalkSwingX: (v) => { if (sway) sway.walkSwingX = v; },
            getWalkBobY: () => sway?.walkBobY ?? 0.15,
            setWalkBobY: (v) => { if (sway) sway.walkBobY = v; },
            getRecoilKickZ: () => sway?.recoilKickZ ?? -1.5,
            setRecoilKickZ: (v) => { if (sway) sway.recoilKickZ = v; },
            getRecoilKickY: () => sway?.recoilKickY ?? 0.8,
            setRecoilKickY: (v) => { if (sway) sway.recoilKickY = v; },
            getRecoilRecovery: () => sway?.recoilRecoverySpeed ?? 12.0,
            setRecoilRecovery: (v) => { if (sway) sway.recoilRecoverySpeed = v; },
            allWeaponIds: allIds,
            allWeaponNames: allNames,
        };
    }

    /**
     * Builds context for the Audio ImGui tab.
     */
    private _buildAudioTabContext(): AudioTabContext {
        const am = this._audioManager!;
        return {
            getMasterVolume: () => am.getMasterVolume(),
            setMasterVolume: (v) => { am.setMasterVolume(v); },
            isFootstepPlaying: () => am.isFootstepPlaying,
            isWindPlaying: () => am.isSoundPlaying("ambient_wind.mp3"),
        };
    }

    /**
     * Builds context for the Physics ImGui tab.
     */
    private _buildPhysicsTabContext(): PhysicsTabContext {
        const pc = this._playerController!;
        return {
            getSpeed: () => PLAYER_STATS.movementSpeed,
            setSpeed: (v) => { PLAYER_STATS.movementSpeed = v; },
            getJumpHeight: () => PLAYER_STATS.jumpHeight,
            setJumpHeight: (v) => { PLAYER_STATS.jumpHeight = v; },
            getCapsuleHeight: () => PLAYER_STATS.capsuleHeight,
            getCapsuleRadius: () => PLAYER_STATS.capsuleRadius,
            isNoclip: () => pc.isNoclip,
            toggleNoclip: () => { pc.toggleNoclip(); },
            getProjectileLifetime: () => PROJECTILE_LIFETIME,
            setProjectileLifetime: (v) => {
                setProjectileLifetime(v);
            },
            getActiveProjectileCount: () => this._weaponManager?.activeProjectileCount ?? 0,
            getVerticalVelocity: () => pc.verticalVelocity,
            getPlayerState: () => pc.state,
        };
    }

    /**
     * Builds context for the Progression ImGui tab.
     */
    private _buildProgressionTabContext(): ProgressionTabContext {
        const pm = ProgressionManager.getInstance();
        return {
            getLevel: () => pm.currentLevel,
            setLevel: (v) => {
                pm.setLevel(v);
                this._xpBarUI?.onXPGained(true);
            },
            getXP: () => pm.currentXP,
            getXPForLevel: () => pm.xpForCurrentLevel,
            getXPProgress: () => pm.xpProgressInLevel,
            addXP: (amount) => {
                const result = pm.addXP(amount);
                this._xpBarUI?.onXPGained(result.leveledUp);
                if (result.leveledUp) {
                    this._levelUpUI?.show(result.newLevel, result.unlockedWeapons);
                }
            },
            unlockAll: () => {
                pm.setLevel(30);
                this._xpBarUI?.onXPGained(true);
            },
            getUnlockedWeapons: () => pm.getUnlockedWeapons(pm.currentLevel),
            getAllWeaponUnlocks: () => {
                return WEAPON_UNLOCK_REQUIREMENTS.map(req => ({
                    name: WEAPON_STATS[req.weaponId]?.name ?? req.weaponId,
                    level: req.unlockLevel,
                    unlocked: pm.isWeaponUnlocked(req.weaponId),
                }));
            },
        };
    }

    /**
     * Builds context for the Performance ImGui tab.
     */
    private _buildPerformanceTabContext(): PerformanceTabContext {
        const engine = this._manager.engine;
        const scene = this._scene;
        return {
            getFPS: () => engine.getFps(),
            getFrameTimeMs: () => engine.getDeltaTime(),
            getDrawCalls: () => (engine as unknown as { _drawCalls: { current: number } })._drawCalls?.current ?? 0,
            getActiveMeshes: () => scene.getActiveMeshes().length,
            getActiveParticles: () => scene.getActiveParticles(),
            getTotalVertices: () => scene.getTotalVertices(),
            getTotalFaces: () => scene.getActiveMeshes().data.reduce(
                (sum, m) => sum + ((m as AbstractMesh).getTotalIndices?.() ?? 0) / 3, 0,
            ),
            getResolution: () => `${engine.getRenderWidth()} x ${engine.getRenderHeight()}`,
        };
    }

    /**
     * Builds context for the Mirror Clone ImGui tab.
     */
    private _buildMirrorTabContext(): MirrorTabContext {
        return {
            isSpawned: () => this._mirrorClone?.isSpawned ?? false,
            spawn: () => {
                if (!this._playerController || !this._weaponManager) return;
                if (!this._mirrorClone) {
                    this._mirrorClone = new MirrorClone(
                        this._scene,
                        this._playerController,
                        this._weaponManager,
                        this._audioManager,
                    );
                }
                this._mirrorClone.spawn();
            },
            despawn: () => {
                this._mirrorClone?.despawn();
            },
            getOffsetDistance: () => this._mirrorClone?.offsetDistance ?? 200,
            setOffsetDistance: (v) => {
                if (this._mirrorClone) this._mirrorClone.offsetDistance = v;
            },
            getCollisionEnabled: () => this._mirrorClone?.collisionEnabled ?? false,
            setCollisionEnabled: (v) => {
                if (this._mirrorClone) this._mirrorClone.collisionEnabled = v;
            },
            getRotationLocked: () => this._mirrorClone?.rotationLocked ?? false,
            setRotationLocked: (v) => {
                if (this._mirrorClone) this._mirrorClone.rotationLocked = v;
            },
            getLockedYaw: () => this._mirrorClone?.lockedYaw ?? 0,
            setLockedYaw: (v) => {
                if (this._mirrorClone) this._mirrorClone.lockedYaw = v;
            },
            getLockedPitch: () => this._mirrorClone?.lockedPitch ?? 0,
            setLockedPitch: (v) => {
                if (this._mirrorClone) this._mirrorClone.lockedPitch = v;
            },
            getLeanAmount: () => this._playerController?.leanAmount ?? 0,
            // POV (camera) lean parameters
            getPovMaxLeanAngle: () => this._playerController?.maxLeanAngle ?? 0.1745,
            setPovMaxLeanAngle: (v) => {
                if (this._playerController) this._playerController.maxLeanAngle = v;
            },
            getPovLeanSpeed: () => this._playerController?.leanSpeed ?? 8,
            setPovLeanSpeed: (v) => {
                if (this._playerController) this._playerController.leanSpeed = v;
            },
            getPovLeanOffset: () => this._playerController?.leanOffset ?? 50,
            setPovLeanOffset: (v) => {
                if (this._playerController) this._playerController.leanOffset = v;
            },
            // Model (3rd-person) lean parameters
            getModelMaxLeanAngle: () => this._mirrorClone?.modelMaxLeanAngle ?? 0.524,
            setModelMaxLeanAngle: (v) => {
                if (this._mirrorClone) this._mirrorClone.modelMaxLeanAngle = v;
            },
            getModelLeanSpeed: () => this._mirrorClone?.modelLeanSpeed ?? 8,
            setModelLeanSpeed: (v) => {
                if (this._mirrorClone) this._mirrorClone.modelLeanSpeed = v;
            },
            getModelLeanOffset: () => this._mirrorClone?.modelLeanOffset ?? 30,
            setModelLeanOffset: (v) => {
                if (this._mirrorClone) this._mirrorClone.modelLeanOffset = v;
            },
            getTorsoLeanRatio: () => this._mirrorClone?.torsoLeanRatio ?? 1.45,
            setTorsoLeanRatio: (v) => {
                if (this._mirrorClone) this._mirrorClone.torsoLeanRatio = v;
            },
        };
    }

    /**
     * Disposes all scene resources including player, weapon, HUD, input, and networking.
     */
    public override dispose(): void {
        // Clear ImGui draw callback so panels don't reference disposed objects
        this._manager.imguiManager.setDrawCallback(null);

        if (this._onPointerLockChange) {
            document.removeEventListener("pointerlockchange", this._onPointerLockChange);
        }

        // Clean up networking
        if (this._isNetworked) {
            const network = NetworkManager.getInstance();
            network.onPlayerAdded = null;
            network.onPlayerRemoved = null;
            network.onRemoteFire = null;
            network.onHitConfirmed = null;
            network.onPlayerHit = null;
            network.onPlayerKilled = null;
            network.onSpawn = null;
            network.onRespawn = null;
            network.onMatchEnded = null;
            network.onMatchReset = null;
        }
        for (const remote of this._remotePlayers.values()) {
            remote.dispose();
        }
        this._remotePlayers.clear();
        for (const proj of this._remoteProjectiles) {
            proj.dispose();
        }
        this._remoteProjectiles = [];

        if (this._weaponManager) {
            this._weaponManager.onFire = null;
            this._weaponManager.onProjectileHit = null;
        }

        // Clean up test dummies
        for (const remote of this._testDummies.values()) {
            remote.dispose();
        }
        this._testDummies.clear();

        this._consoleUI?.dispose();
        if (this._colliderDebugObserver) {
            this._scene.onAfterRenderObservable.remove(this._colliderDebugObserver);
            this._colliderDebugObserver = null;
        }
        this._colliderDebugTrackedBodies.clear();
        this._colliderDebugTrackedRagdolls.clear();
        this._physicsViewer?.dispose();
        this._physicsViewer = null;
        for (const mat of this._debugCapsuleMaterials) mat.dispose();
        this._debugCapsuleMaterials = [];
        this._debugCapsuleOriginalState.clear();
        this._mirrorClone?.dispose();
        this._localJumpSmoke?.dispose();
        for (const smoke of this._botJumpSmokes.values()) {
            smoke.dispose();
        }
        this._botJumpSmokes.clear();
        this._debugNavMesh?.dispose();
        this._weaponDropManager?.dispose();
        this._botManager?.dispose();
        this._levelUpUI?.dispose();
        this._xpBarUI?.dispose();
        this._damageNumberUI?.dispose();
        this._killNotificationUI?.dispose();
        this._minimapUI?.dispose();
        this._debugOverlayUI?.dispose();
        this._matchTimerUI?.dispose();
        this._scoreboardUI?.dispose();
        this._killFeedUI?.dispose();
        this._pauseMenuUI?.dispose();
        this._deathOverlay?.dispose();
        this._hitIndicator?.dispose();
        this._crosshairHUD?.dispose();
        this._weaponSway?.dispose();
        this._weaponManager?.dispose();
        this._weaponViewmodel?.dispose();
        this._audioManager?.dispose();
        this._playerController?.dispose();
        this._inputManager?.dispose();
        this._shadowGenerator?.dispose();
        GraphicsSettings.getInstance().unbindPipeline();
        super.dispose();
    }
}
