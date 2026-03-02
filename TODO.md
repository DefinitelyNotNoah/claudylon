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
