# TODO

## Asset Gathering
- [x] Download Kenney Prototype Textures pack → `public/assets/textures/prototype/`
- [x] Download Kenney Crosshair Pack → `public/assets/textures/crosshair/`
- [x] Source weapon models (9 total) → `public/assets/weapons/`
    - [x] USP-45 (`usp.glb`)
    - [x] M9 (`m9.glb`)
    - [x] Desert Eagle (`eagle.glb`)
    - [x] AK-47 (`ak47.glb`) — replaces M16
    - [x] M4A1 (`m4a1.glb`)
    - [x] SCAR (`scar.glb`)
    - [x] Intervention (`intervention.glb`)
    - [x] Barrett .50 Cal (`50cal.glb`)
    - [x] SVD (`svd.glb`)
- [x] Source player character model → `public/assets/characters/Animated Base Character.glb`
- [x] Source map props → `public/assets/props/`
    - [x] Shipping container (`shippingcontainer.glb`)
    - [x] Jeep (`jeep.glb`)
    - [x] Barrel (`barrel_red.glb`)
    - [x] Fence piece (`fence_piece.glb`)
    - [x] Fence end (`fence_end.glb`)
- [x] Source audio → `public/assets/audio/`
    - [x] Pistol fire (`pistol.mp3`) — also used for rifle fire
    - [x] Sniper fire (`sniper.mp3`)
    - [x] Sniper bolt/reload (`sniper_lever.mp3`)
    - [x] Footsteps (`footsteps.mp3`)
    - [x] Hit marker (`hitmarker.mp3`)
    - [x] Empty click (`empty_click.mp3`)
    - [x] Reload (`reload_rifle.mp3`)
    - [x] Ambient wind (`ambient_wind.mp3`)
    - [x] Ambient warfare (`ambient_warfare_2.mp3`)
    - [x] Level up (`levelup.mp3`)

### Assets Deferred (Add Later)
- [ ] Rifle fire sound (distinct from pistol — using pistol.mp3 universally for now)
- [ ] Per-weapon reload sounds (pistol, sniper — sniper_lever.mp3 covers sniper only)
- [ ] Jump, land, death player sounds
- [ ] UI sounds (button click, match start)
- [ ] Weapon class icons (`icon_pistol.png`, `icon_rifle.png`, `icon_sniper.png`)

## Project Setup
- [x] Install `@babylonjs/loaders@8.41.0` for GLB model loading
- [x] Install Colyseus dependencies (`colyseus`, `@colyseus/schema`, `@colyseus/sdk`)
- [x] Configure server-side TypeScript (`tsconfig-server.json`)
- [x] Set up Colyseus server entry point (`src/server/index.ts`)
- [x] Refactor `App.ts` into `src/client/core/` structure

## Core Systems — Shared
- [x] Define shared types (`src/shared/types/index.ts`)
    - [x] `PlayerStateEnum` (Idle, Walking, Jumping, Falling, Firing, Reloading, Dead)
    - [x] `WeaponStats` interface
    - [x] `FireMode` type
    - [x] `WeaponCategory` type
    - [x] `WeaponId` type
    - [x] `PlayerStats` interface
    - [x] `WeaponUnlockRequirement` interface
    - [x] Networking types (`PlayerUpdateData`, `FireEventData`, `HitClaimData`, etc.)
- [x] Define shared constants (`src/shared/constants/`)
    - [x] Weapon stats for all 9 weapons
    - [x] Player stats (health, speed, jump height)
    - [x] XP curve and level thresholds
    - [x] Weapon unlock requirements
    - [x] Bot constants (count, difficulty)
    - [x] Map constants (spawn points, match duration)

## Core Systems — Client
- [x] GameManager singleton (`src/client/core/GameManager.ts`)
- [x] GameScene abstract base class (`src/client/core/GameScene.ts`)
- [x] Input manager (`src/client/core/InputManager.ts`) — keyboard, mouse, pointer lock, sensitivity
- [x] Audio manager (`src/client/audio/AudioManager.ts`) — spatial audio, SFX pools, footsteps, ambient
- [x] Main Menu scene (`src/client/scenes/MainMenuScene.ts`)
    - [x] Start Game button → loads MatchScene
    - [x] Mouse sensitivity slider (localStorage persistence)
    - [x] Master volume slider (localStorage persistence)
    - [x] Bot count/difficulty settings
    - [x] Create-a-Class button
    - [x] Host/Join/Offline buttons
- [x] Lobby scene (`src/client/scenes/LobbyScene.ts`)
    - [x] Connected players list
    - [x] Host start button
- [x] Match scene (`src/client/scenes/MatchScene.ts`)
    - [x] Map construction (Shipment layout — programmatic geometry + GLB props)
    - [x] Lighting and environment setup
    - [x] Spawn point placement
    - [x] Map boundaries
    - [x] Post-processing pipeline (MSAA, FXAA, bloom, sharpen, tone mapping, grain)
- [x] Player controller (`src/client/player/`)
    - [x] First-person camera (manually driven FreeCamera)
    - [x] WASD movement with Havok capsule PhysicsCharacterController
    - [x] Mouse look (pointer lock)
    - [x] Jumping
    - [x] Player state machine (Idle, Walking, Jumping, Falling)
    - [x] Noclip mode (V key toggle)
    - [x] Death/respawn system
- [x] Weapon system (`src/client/weapons/`)
    - [x] Viewmodel rendering (first-person weapon display)
    - [x] Weapon class (stats, fire modes, ammo management)
    - [x] Weapon switching (slot 1 / slot 2)
    - [x] Firing (semi, burst, automatic)
    - [x] Reloading (with viewmodel tilt animation)
    - [x] Projectile spawning and physics
    - [x] Muzzle flash effects
    - [x] Weapon sway (idle, walking, jumping animations on viewmodel)
- [x] HUD (`src/client/ui/`)
    - [x] Crosshair
    - [x] Health display
    - [x] Ammo counter
    - [x] Weapon name display
    - [x] Kill feed
    - [x] Scoreboard
    - [x] Hit indicator (directional)
    - [x] Death overlay
    - [x] Match timer
    - [x] Damage numbers
    - [x] XP bar
    - [x] Level up notification
    - [x] Kill notifications (CoD-style stacked)
    - [x] Minimap (circular radar)
    - [x] Debug overlay (toggle)
    - [x] Pause menu (with sensitivity + volume sliders)
    - [x] Create-a-Class UI
- [x] Network client (`src/client/network/`)
    - [x] Colyseus client connection
    - [x] State interpolation
    - [x] Input sending
    - [x] Remote player rendering

## Core Systems — Server
- [x] Colyseus server setup (`src/server/index.ts`)
- [x] Lobby room (`src/server/rooms/LobbyRoom.ts`)
    - [x] Player join/leave handling
    - [x] Host start game trigger
- [x] Match room (`src/server/rooms/MatchRoom.ts`)
    - [x] Game state management
    - [x] Player position relay
    - [x] Hit detection and damage (client-authoritative with server validation)
    - [x] Kill tracking and XP awarding
    - [x] Respawn system
- [x] Server-side entities (`src/server/entities/`)
    - [x] PlayerSchema state
    - [x] LobbyState / MatchState

## AI / Bot System
- [x] Pathfinding system (`src/client/ai/NavigationManager.ts` — RecastJS navmesh)
- [x] Bot controller (`src/client/ai/BotController.ts`)
    - [x] Patrol behavior (navmesh waypoints)
    - [x] Line-of-sight detection
    - [x] Target acquisition and firing (FOV + reaction time)
    - [x] Aim lerp with accuracy spread (difficulty-based)
- [x] Bot manager (`src/client/ai/BotManager.ts`)
    - [x] Spawns configurable number of bots (1-8)
    - [x] Difficulty settings (easy/medium/hard)
    - [x] Bot projectile management

## Progression System
- [x] Progression manager (`src/client/progression/ProgressionManager.ts`)
- [x] XP curve implementation
- [x] Level calculation
- [x] Weapon unlock checks against `WEAPON_UNLOCK_REQUIREMENTS`
- [x] Create-a-Class loadout system (localStorage persistence)

## Polish & Integration
- [x] Anti-aliasing pipeline (MSAA + FXAA + bloom + sharpen + tone mapping via DefaultRenderingPipeline)
- [x] Master volume control (slider in main menu + pause menu, localStorage persistence)
- [x] Final asset audit — confirm all manifest items are present

## ImGui Debug Panel System
> Dear ImGui overlay for real-time debugging and value tuning.
> Toggle: L key (works in all scenes, even when input is suppressed).
> Package: `@mori2003/jsimgui` v0.13.0. Architecture: separate WebGL2 canvas overlay with `pointer-events: none`, document-level input listeners.
> Files: `src/client/ui/ImGuiManager.ts` (singleton), `src/client/ui/imgui/` (tab modules).
> All tabs live inside a single "Debug Panel" window with a tab bar.

### Phase 1 — Core Panels (DONE)
- [x] Install `@mori2003/jsimgui` and initialize ImGuiManager singleton
- [x] Hook into GameManager render loop (`engine.onEndFrameObservable`)
- [x] L key toggle in InputManager (allowed through input suppression)
- [x] Overlay canvas with `pointer-events: none` + document-level mouse/keyboard listeners
- [x] High-DPI scaling via CSS transform trick (physical pixels + `scale(1/dpr)`)
- [x] Pointer lock disable when ImGui visible, restore when hidden
- [x] **Player tab** (`src/client/ui/imgui/PlayerPanel.ts`)
    - [x] Health slider (0-200), God Mode / Noclip / Infinite Ammo checkboxes
    - [x] Speed (100-5000 cm/s), Jump Height (50-1000 cm), FOV (40-150°) sliders
    - [x] Position X/Y/Z inputs + Teleport button
    - [x] Kill / Respawn action buttons
- [x] **Bots tab** (`src/client/ui/imgui/BotPanel.ts`)
    - [x] Bot count display, Add Bot / Kill All / Respawn All buttons
    - [x] Health slider (all bots), Freeze All / Ragdoll All toggles
    - [x] AI Difficulty (Live): Aim Accuracy, Reaction Time, FOV, Engage Range, Fire Interval sliders
    - [x] Bot Details: per-bot tree nodes with weapon, position, state
- [x] **Settings tab** (drawn by ImGuiManager)
    - [x] UI Scale slider (0.5-3.0) via `style.FontScaleMain`, persisted to localStorage `fps_imgui_scale`
- [x] Tabbed layout — single "Debug Panel" window with `BeginTabBar`/`BeginTabItem`
- [x] L key toggle wired in MainMenuScene, LobbyScene, MatchScene

### Phase 2 — Full Debug Suite (DONE)
- [x] **Weapons tab** (`src/client/ui/imgui/WeaponsTab.ts`)
    - [x] Per-weapon stats editing: damage, fire rate, projectile speed, mag size, reload time
    - [x] Current weapon ammo state (read-only: current mag / reserve)
    - [x] Weapon switch combo (swap active weapon to any of 9)
    - [x] Refill Ammo button
    - [x] Sway parameters: idle/walk amplitudes, recoil kick, recovery speed
- [x] **Audio tab** (`src/client/ui/imgui/AudioTab.ts`)
    - [x] Master volume slider
    - [x] Sound status (footstep/wind playing indicators)
- [x] **Graphics tab** (`src/client/ui/imgui/GraphicsTab.ts`)
    - [x] Auto-generated from GRAPHICS_SETTINGS_DESCRIPTORS (no context needed)
    - [x] MSAA samples, FXAA toggle, bloom, tone mapping, exposure, contrast, sharpen, grain
    - [x] Grouped by category with CollapsingHeader
    - [x] Reset to defaults button
- [x] **Physics tab** (`src/client/ui/imgui/PhysicsTab.ts`)
    - [x] Move speed, jump height sliders
    - [x] Player capsule height / radius display (read-only)
    - [x] Noclip toggle
    - [x] Projectile lifetime slider
    - [x] Active projectile count (read-only)
    - [x] Vertical velocity, player state display
- [x] **Progression tab** (`src/client/ui/imgui/ProgressionTab.ts`)
    - [x] Current level and XP display with progress bar
    - [x] Set level directly (slider 1-30)
    - [x] Add XP button (configurable amount)
    - [x] Unlock All Weapons button
    - [x] Weapon unlocks list with CollapsingHeader
- [x] **Performance tab** (`src/client/ui/imgui/PerformanceTab.ts`)
    - [x] FPS counter (current, avg, min, max) with rolling stats
    - [x] Frame time in ms
    - [x] Draw calls count
    - [x] Active meshes count
    - [x] Active particles count
    - [x] Total vertices / faces
    - [x] Resolution display
    - [x] Reset stats button
- [x] Wire all new tabs into MatchScene draw callback with context builders

## Player Leaning System (DONE)
- [x] Add Q (lean left) and E (lean right) held inputs to InputManager
- [x] Change interact key from E to F (free Q/E for leaning)
- [x] Smooth lean interpolation in PlayerController (configurable angle, speed, offset)
- [x] Quaternion camera rotation (Yaw * Pitch * Roll) to avoid gimbal lock
- [x] Horizontal camera offset perpendicular to facing direction
- [x] Viewmodel lean shift and tilt in WeaponSway

## Agent Team Tasks

> Development is now structured around Agent Teams. The lead (Opus) assigns tasks to specialized teammates.
> Roles: Map Builder, Networking Engineer, Animator/VFX Dev (all Sonnet).
> Each role owns specific files — see CLAUDE.md "Agent Teams" section for ownership rules.

### Map Builder
- [ ] Design and build additional maps beyond Shipment
- [ ] Improve prop placement and cover layout for better gameplay flow
- [ ] Add new spawn point configurations per map
- [ ] Lighting and atmosphere improvements

### Networking Engineer
- [x] Audit all gameplay features for multiplayer sync gaps
- [x] Ensure leaning state syncs to remote players
- [ ] Ensure weapon switching/reloading syncs correctly
- [x] Validate singleplayer mode remains fully unnetworked
- [ ] Improve hit validation and anti-cheat measures

### Animator / VFX Dev
- [ ] Add weapon reload animations (viewmodel tilt is placeholder)
- [ ] Improve muzzle flash effects
- [ ] Add hit/impact visual effects
- [ ] Explore shader effects (e.g., damage vignette, scope overlay)
- [ ] Polish weapon sway and recoil feel

### Cross-Team
- [x] Coordinate leaning sync (Animator defines visuals → Networking syncs state)
- [ ] New maps need networking spawn point support (Map Builder → Networking)
- [ ] VFX need to play for remote players (Animator → Networking)

## Mirror Clone Debug Tool (DONE)
- [x] MirrorClone class (`src/client/debug/MirrorClone.ts`)
    - [x] Spawn/despawn RemotePlayer at configurable offset
    - [x] Position, rotation, weapon, and state sync from local player
    - [x] Fire sync with recoil animation + spatial gunshot audio
    - [x] Collision toggle (pickable hitbox)
    - [x] Rotation lock with manual yaw/pitch controls
- [x] Torso lean on clone via spine bone quaternion rotation
    - [x] onAfterAnimationsObservable hook (prevents animation overwrite)
    - [x] Distributed across Spine, Spine1, Spine2 bones for natural curve
    - [x] Head bone-relative lean axis (accounts for animation pose offset)
    - [x] Tunable torso lean ratio (default 1.0, range 0-2x)
- [x] Mirror ImGui tab (`src/client/ui/imgui/MirrorTab.ts`)
    - [x] Spawn/despawn button
    - [x] Offset distance slider
    - [x] Collision checkbox
    - [x] Leaning section: lean amount display, max angle, speed, offset, torso ratio
    - [x] Rotation lock section: lock checkbox, yaw/pitch sliders, reset button
