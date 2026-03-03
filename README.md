# FPS Game

A multiplayer free-for-all first-person shooter built with Babylon.js and Colyseus.

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Game Engine | Babylon.js | 8.41.0 |
| Physics | Havok (via @babylonjs/havok) | 1.3.10 |
| Networking | Colyseus | 0.17.8 |
| ImGui Debug | @mori2003/jsimgui | 0.13.0 |
| Bundler | Vite | 7.3.1 |
| Language | TypeScript | 5.9.3 |
| Styling | Tailwind CSS | 4.1.18 |

## Architecture Overview

### Scene Construction
All scenes are built programmatically in TypeScript — no editor-exported `.babylon` scene files. The Babylon.js Community Editor is used solely as a runtime environment for launching and testing the game.

### Client-Server Model
- **Server-authoritative** architecture via Colyseus
- Server owns game state (player positions, health, projectile simulation, hit detection)
- Client sends inputs, receives state updates, and handles rendering/interpolation
- Shared types and constants live in `src/shared/` and are used by both client and server

### Paradigm
Fully object-oriented. Every major concept is a class:
- `Player` — controller, input, state machine
- `Weapon` — stats, fire modes, ammo management
- `Projectile` — physics body, collision, damage
- `Bot` — AI behavior, pathfinding, inherits player systems
- `GameScene` — base class for all scenes (MainMenu, Lobby, Match)

## Project Structure

```
fps_project/
├── src/
│   ├── client/                 # Client-side game code
│   │   ├── core/               # Engine setup, game manager, scene management
│   │   ├── scenes/             # Scene classes (MainMenu, Lobby, Match)
│   │   ├── player/             # Player controller, state machine, input handling
│   │   ├── weapons/            # Weapon system, projectile rendering
│   │   ├── ai/                 # Bot behavior, pathfinding (client-side prediction)
│   │   ├── ui/                 # HUD, menus, server browser (Babylon.js GUI)
│   │   │   └── imgui/          # ImGui debug panel tab modules
│   │   ├── network/            # Colyseus client, state interpolation
│   │   ├── audio/              # Audio manager, spatial audio
│   │   └── progression/        # XP, leveling, weapon unlocks
│   ├── server/                 # Colyseus game server
│   │   ├── rooms/              # Room definitions (LobbyRoom, MatchRoom)
│   │   ├── systems/            # Server-side game logic (combat, spawning)
│   │   └── entities/           # Server-side entity state
│   ├── shared/                 # Shared between client and server
│   │   ├── types/              # Interfaces, enums, type definitions
│   │   ├── constants/          # Weapon stats, player stats, XP curve, unlocks
│   │   └── weapons/            # Weapon definitions used by both sides
│   ├── App.ts                  # Application entry (will be refactored)
│   ├── main.ts                 # DOM entry point
│   └── style.css               # Tailwind CSS
├── public/
│   └── assets/                 # Game assets loaded at runtime
│       ├── weapons/            # Weapon .glb models
│       ├── characters/         # Player character .glb models
│       ├── textures/           # Kenney Prototype Textures and others
│       │   └── prototype/      # Kenney Prototype Textures pack
│       ├── props/              # Map prop .glb models (containers, jeep, barrel, fences)
│       ├── audio/              # All audio files (.mp3)
│       │   ├── weapons/        # pistol.mp3, rifle.mp3, sniper.mp3, sniper_lever.mp3
│       │   ├── player/         # footsteps.mp3, hitmarker.mp3
│       │   ├── ambient/        # wind.mp3, warfare_2.mp3, land.mp3, empty_click.mp3, reload_rifle.mp3
│       │   └── ui/             # levelup.mp3
│       └── ui/                 # (future) icons, fonts
├── CLAUDE.md                   # Decisions log (session continuity)
├── README.md                   # This file
├── TODO.md                     # Task tracker
├── FPS Prompt.md               # Original project specification
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## Game Scenes

### 1. Main Menu
- Start Game button opens a server browser listing available Colyseus lobbies
- Mouse sensitivity slider (persisted to localStorage)

### 2. Lobby
- UI-only (no 3D rendering)
- Shows connected players
- Host has a Start Game button; others wait

### 3. Match (Free-for-All)
- Fully playable FPS on the active map
- Physical projectiles (not hitscan) — travel through the scene as physics bodies
- Map boundaries enforced
- Bots fill empty slots and behave as first-class players

## Ragdoll Physics

When bots die, their skeleton transitions to physics-driven ragdoll with an impulse from the hit direction. This uses Babylon.js's built-in `Ragdoll` class (`@babylonjs/core/Physics/v2/ragdoll`) with a 14-bone Mixamo rig configuration.

### Optimization: Pre-allocated Toggle Approach

Ragdoll physics bodies (14 Havok aggregates + 13 constraints) are **created once** during bot initialization and kept in memory for the bot's lifetime — not created/destroyed on every death/respawn cycle. This avoids expensive Havok allocation on each kill.

- **On init (`initializeRagdoll`)**: Creates all physics bodies in `ANIMATED` mode with collision masks set to `0` (invisible to physics simulation)
- **On death (`activateRagdoll`)**: Toggles bodies from `ANIMATED` → `DYNAMIC`, enables collision masks, severs bone→TransformNode links so physics drives the skeleton
- **On respawn (`deactivateRagdoll`)**: Toggles bodies back to `ANIMATED`, re-links bones to restore animation control, zeros collision masks again

**Expected behavior**: There are two one-time FPS hitches per bot:
1. **First hitch (bot creation)**: Havok allocates 14 physics bodies + 13 constraints
2. **Second hitch (first death)**: Havok warms up dynamic simulation state (solver data, broadphase insertion)

After both events have fired once, all subsequent death/respawn cycles are essentially free (~0.1–0.4ms) because the physics infrastructure is already allocated and warmed.

## Map Design

First map: **Shipment** — a small, symmetrical layout with shipping containers, jeeps, barrels, and fences as cover. Built programmatically using .glb props and primitive geometry with Kenney Prototype Textures applied.

### Available Props
- `shippingcontainer.glb` — primary large cover
- `jeep.glb` — medium cover
- `barrel_red.glb` — small scattered cover
- `fence_piece.glb` + `fence_end.glb` — boundary fencing / barriers

## Weapons

Three classes, three weapons each. All fire physical projectiles.

### Pistols
| Weapon | Fire Mode |
|---|---|
| USP-45 | Semi |
| M9 | Semi |
| Desert Eagle | Semi |

### Assault Rifles
| Weapon | Fire Mode |
|---|---|
| AK-47 | 3-Round Burst |
| M4A1 | Automatic |
| SCAR | Automatic |

### Snipers
| Weapon | Fire Mode |
|---|---|
| Intervention | Semi |
| Barrett .50 Cal | Semi |
| SVD | Semi |

## Player State Machine

Enum-based state machine in `src/client/player/PlayerStateMachine.ts`.

States: `Idle`, `Walking`, `Jumping`, `Falling`

Transitions: Idle ↔ Walking (input), Idle/Walking → Jumping (space while grounded), Any → Falling (airborne), Falling → Idle/Walking (ground contact).

## Progression System

`src/client/progression/ProgressionManager.ts` — localStorage persistence (`fps_player_xp`, `fps_player_level`).

- Max level: 30, XP formula: `100 * (level + 1)^1.5` per level
- XP per kill: 100 (configurable via `XP_PER_KILL`)
- Weapons unlock at level thresholds defined in `WEAPON_UNLOCK_REQUIREMENTS`
- Level-up triggers `LevelUpUI` popup showing new level + unlocked weapons
- Create-a-Class loadout system (`src/client/ui/CreateClassUI.ts`) — 4 presets + custom, locked weapons greyed out

## Controls

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (adjustable sensitivity) |
| 1 | Equip Weapon Slot 1 |
| 2 | Equip Weapon Slot 2 |
| Left Click | Fire |
| R | Reload |
| Space | Jump |
| V | Toggle Noclip (free-fly mode, 2000 cm/s) |
| P | Pause (NOT ESC — ESC triggers pointer lock cooldown) |
| L | Toggle ImGui Debug Panel (works even when input suppressed) |
| ` (Backtick) | Toggle Developer Console |

## ImGui Debug Panel System

A Dear ImGui overlay provides real-time debugging and value tuning for every game system. Toggle with **L** key — works in all scenes (MainMenu, Lobby, Match), even when input is suppressed.

### Architecture
- **Package:** `@mori2003/jsimgui` v0.13.0 (Dear ImGui JS bindings, WebGL2 canvas, docking branch)
- **Overlay canvas:** Separate `<canvas>` element at z-index 100 with `pointer-events: none`
- **Input:** Document-level mouse/keyboard listeners feed ImGui's IO directly (bypasses canvas pointer-events)
- **DPI:** CSS transform trick — canvas CSS size = physical pixels, `transform: scale(1/dpr)` for sharp rendering at native resolution
- **Singleton:** `ImGuiManager` (`src/client/ui/ImGuiManager.ts`) — initialized by GameManager, hooks into `engine.onEndFrameObservable`
- **Tab modules:** `src/client/ui/imgui/` — each tab is a standalone draw function with a context interface

### Current Tabs
| Tab | File | Controls |
|-----|------|----------|
| Player | `PlayerPanel.ts` | Health, god mode, noclip, infinite ammo, speed, jump height, FOV, position/teleport, kill/respawn |
| Bots | `BotPanel.ts` | Bot count, add/kill/respawn, freeze/ragdoll, AI difficulty sliders, per-bot details |
| Weapons | `WeaponsTab.ts` | Per-weapon stats editing (damage, fire rate, projectile speed, mag size, reload time), ammo state, weapon switch combo, refill ammo, sway/recoil tuning |
| Audio | `AudioTab.ts` | Master volume slider, footstep/wind playing status |
| Graphics | `GraphicsTab.ts` | Auto-generated from `GRAPHICS_SETTINGS_DESCRIPTORS` — MSAA, FXAA, bloom, tone mapping, exposure, contrast, sharpen, grain, reset to defaults |
| Physics | `PhysicsTab.ts` | Move speed, jump height, capsule info, noclip toggle, projectile lifetime/count, vertical velocity, player state |
| Progression | `ProgressionTab.ts` | Level/XP display with progress bar, set level slider, add XP, unlock all weapons, weapon unlock list |
| Performance | `PerformanceTab.ts` | FPS (current/avg/min/max), frame time, draw calls, active meshes, particles, vertices, faces, resolution, reset stats |
| Settings | Built into ImGuiManager | UI Scale slider (0.5-3.0x), persisted to localStorage |

### Adding a New Tab
1. Create `src/client/ui/imgui/MyTab.ts` with a context interface and `drawMyTab(ctx)` function
2. In MatchScene's draw callback, add `if (ImGui.BeginTabItem("My Tab")) { drawMyTab(ctx); ImGui.EndTabItem(); }`
3. Build the context object in `_buildMyTabContext()` with getter/setter closures

## Naming Conventions (Scene Nodes)

All programmatically created scene nodes follow these patterns:

| Entity Type | Pattern | Examples |
|---|---|---|
| Spawn points | `spawn_point_{n}` | `spawn_point_1`, `spawn_point_2` |
| Map geometry | `map_{description}` | `map_floor`, `map_wall_north` |
| Cover / props | `prop_{type}_{n}` | `prop_crate_1`, `prop_barrel_3` |
| Lights | `light_{type}_{n}` | `light_directional_1` |
| Cameras | `camera_{purpose}` | `camera_main`, `camera_menu` |
| Boundaries | `boundary_{side}` | `boundary_north`, `boundary_east` |
| Materials | `mat_{surface}` | `mat_floor`, `mat_crate` |

---

## HUD Components

All HUD elements use Babylon.js `AdvancedDynamicTexture` fullscreen overlays created via the shared `createFullscreenUI()` helper (`src/client/ui/uiUtils.ts`), which enforces `idealWidth = 1920` for consistent scaling across resolutions.

| Component | File | Position | Description |
|---|---|---|---|
| Crosshair + Health + Ammo | `CrosshairHUD.ts` | Center / Bottom-left / Bottom-right | Combined HUD: 24px Kenney crosshair at center, health (28px white monospace) bottom-left 30px padding, ammo (`current / reserve` 28px) bottom-right 30px padding, weapon name label above ammo |
| Minimap | `MinimapUI.ts` | Top-left (15px margin) | 160px circular radar — player at center (green dot), enemies as red dots rotated to face direction. World radius: 1800 cm. Dot pool reused each frame |
| Match Timer | `MatchTimerUI.ts` | Top-center (30px from top) | MM:SS countdown. Turns red below 30s, pulses (3 Hz sine scale) below 10s |
| Hit Indicator | `HitIndicator.ts` | Center (80px radial offset) | Directional red bar pointing toward attacker. 0.15s hold + 0.6s fade. Multiple simultaneous indicators supported |
| Damage Numbers | `DamageNumberUI.ts` | World-space projected | Floating numbers at hit position, drift upward (+120 cm/s) + lateral (±60 cm/s). White for hits, gold for kills. 0.8s lifetime with linear fade |
| Kill Feed | `KillFeedUI.ts` | Top-right (30px padding) | `"killer [weapon] victim"` entries. Green if local killer, red if local victim. Max 5 entries, 4s hold + 1s fade |
| Kill Notifications | `KillNotificationUI.ts` | Right-center | CoD-style `"+XP Eliminated VictimName"` stack. Slide-in from right (0.3s ease-out), 1.5s hold, 0.5s fade. Max 6 entries, gold 30px monospace |
| Level Up | `LevelUpUI.ts` | Top-center (100px from top) | Popup on level-up: "LEVEL UP" + level number + unlocked weapons. 0.3s scale-in, 2s hold, 0.5s fade. Gold border, Orbitron font |
| Death Overlay | `DeathOverlay.ts` | Full-screen | Dark red tint (`rgba(80,0,0,0.45)`). Shows "YOU WERE KILLED", killer name, weapon. No timer — hidden on respawn |
| XP Bar | `XPBarUI.ts` | Bottom edge (full-width, 18px) | Blue fill bar with animated lerp (speed 3.0). Shows `LVL N`, `LVL N+1` (or MAX), `N / M XP` |
| Scoreboard | `ScoreboardUI.ts` | Full-screen overlay | TAB-held overlay. Players sorted by kills desc. Local player highlighted. 500px centered panel, Orbitron title |
| Debug Overlay | `DebugOverlayUI.ts` | Top-left (10px) | Dev panel: FPS, resolution, DPR, mesh counts, player state/position, center-screen raycast info (throttled 0.1s). Green monospace on dark bg |
| Developer Console | `DeveloperConsoleUI.ts` | Top 45% of screen | Quake-style drop-down console. Native DOM `<input>` for command entry. Autocomplete (8 suggestions), command history (50 entries), output log (200 lines). Toggled by backtick |
| Pause Menu | `PauseMenuUI.ts` | Full-screen centered | Semi-transparent overlay with RESUME / OPTIONS / MAIN MENU / QUIT buttons. Options opens `OptionsMenuUI` inline |
| Options Menu | `OptionsMenuUI.ts` | Full-screen centered | Tabbed: Game (sensitivity, volume, debug, bot settings) + Graphics (all pipeline sliders). Shared by MainMenuUI and PauseMenuUI |

## Audio System

`src/client/audio/AudioManager.ts` — singleton managing all game audio.

### Sound Pooling
- **Pool size:** 6 instances per audio file (round-robin playback)
- Weapon sounds get **two pools**: spatial (for bots/remote players via `playGunshotAt`) and non-spatial (for local player via `playGunshot`)
- Footsteps and ambient sounds are dedicated single instances (not pooled)

### Sound Files

| Category | File | Volume | Spatial |
|---|---|---|---|
| Weapons | `pistol.mp3` | 1.0 | Yes (+ local non-spatial pool) |
| Weapons | `rifle.mp3` | 0.35 | Yes (+ local non-spatial pool) |
| Weapons | `sniper.mp3` | 1.0 | Yes (+ local non-spatial pool) |
| Weapons | `sniper_lever.mp3` | 1.0 | Yes (spatial only) |
| Player | `footsteps.mp3` | 0.5 | No (dedicated loop) |
| Player | `hitmarker.mp3` | 1.0 | No |
| Ambient | `empty_click.mp3` | 1.0 | No |
| Ambient | `reload_rifle.mp3` | 0.5 | No |
| Ambient | `ambient_wind.mp3` | 0.15 | No (dedicated loop) |
| Ambient | `ambient_warfare_2.mp3` | 0.05 | No (burst system) |
| UI | `levelup.mp3` | 1.0 | No |

### Spatial Audio Parameters
- Distance model: `linear`
- Max distance: 4000 cm
- Ref distance: 200 cm
- Rolloff factor: 2.5

### Footstep System
- Manual looping via `onEndedObservable` (avoids Babylon.js `TmpPlayOptions` bug)
- Instant snap to target volume on start (no ramp-up)
- Fade-out on stop: `fadeSpeed = 5` (~200ms to silence)
- `updateFootsteps(dt)` called every frame by MatchScene

### Ambient System
- **Wind:** Continuous loop at 0.15 volume, manually looped via `onEndedObservable`
- **Warfare bursts:** 10s interval, random 1-3s hold, then fade-out (`fadeSpeed = 1`, ~330ms). Playback rate 0.7 for distant rumble feel

### Known Workarounds
- **TmpPlayOptions bug** (Babylon.js 8.41.0): Shared mutable options object retains `loop: true` after any looping sound plays. All sounds created with `loop: false`; looping managed via `onEndedObservable`
- **`safeSetVolume()`**: Bypasses `Sound.setVolume()` which calls `setValueCurveAtTime` — throws at high FPS when two calls land on the same audio timestamp. Directly sets `gainNode.gain.value` instead

## Graphics Pipeline

`src/client/ui/GraphicsSettings.ts` — singleton managing `DefaultRenderingPipeline`. All settings persisted to localStorage with `fps_gfx_` prefix.

### Post-Processing Settings

| Setting | Default | Range |
|---|---|---|
| Render Scale | 100% | 25-100 |
| MSAA Samples | 8 | 1, 2, 4, 8 |
| FXAA | Enabled | On/Off |
| Bloom | Enabled | On/Off |
| Bloom Threshold | 0.9 | 0-2 |
| Bloom Intensity | 0.05 | 0-1 |
| Bloom Kernel | 16 | 16-128 |
| Bloom Scale | 0.4 | 0.1-1 |
| Tone Mapping | Enabled (Standard) | Standard/ACES |
| Exposure | 1.0 | 0.5-3 |
| Contrast | 1.0 | 0.5-2 |
| Sharpen | Enabled (0.3) | 0-1 |
| Film Grain | Enabled (3) | 0-30 |

### Pipeline Rebuild vs Live Update
- **Rebuild required** (dispose + recreate): MSAA, FXAA, bloom enable, sharpen enable, grain enable
- **Page reload required**: WebGPU toggle
- **Live update** (no rebuild): All other settings (bloom params, tone mapping, exposure, contrast, sharpen amount, grain intensity, render scale)

## Networking

Colyseus 0.17.8 with binary delta-encoded state sync.

### Room Flow
1. **LobbyRoom** (`src/server/rooms/LobbyRoom.ts`) — max 10 clients. First joiner becomes host. Host sends `start_game` to transition all clients
2. **MatchRoom** (`src/server/rooms/MatchRoom.ts`) — max 10 clients. 20 Hz state sync (`patchRate = 50ms`). 16ms simulation interval for timer

### Message Types

**Client → Server:**

| Message | Payload |
|---|---|
| `player_update` | `x, y, z, yaw, pitch, state, weaponId, currentAmmo, reserveAmmo` |
| `fire` | `projectileId, x, y, z, dirX, dirY, dirZ, speed, damage, size, weaponId` |
| `hit_claim` | `projectileId, targetSessionId, damage, weaponId` |
| `start_game` | (empty — lobby host only) |

**Server → Client:**

| Message | Sent To | Description |
|---|---|---|
| `spawn` | Joining client | Initial position on join |
| `respawn` | Victim client | New position after 3s respawn delay |
| `remote_fire` | All except sender | Relayed fire event for projectile rendering |
| `hit_confirmed` | Attacker only | Damage confirmed — triggers hitmarker |
| `player_hit` | All clients | Victim health update + attacker position for hit indicator |
| `player_killed` | All clients | Kill feed entry with killer/victim names + weapon |
| `match_ended` | All clients | Final scoreboard sorted by kills |
| `match_reset` | All clients | New round start |

### Schema Structure

**PlayerSchema** fields: `sessionId`, `displayName`, `x`, `y`, `z`, `yaw`, `pitch`, `health` (int16), `state`, `weaponId`, `currentAmmo`, `reserveAmmo`, `kills`, `deaths`

**Critical**: All `@type()` decorated fields must use the `declare` keyword to prevent TypeScript class field initializers from overwriting Colyseus getter/setter tracking. MapSchema fields initialized after construction in `onCreate()`.

### Remote Players
- `RemotePlayer` (`src/client/network/RemotePlayer.ts`) — client-side visual representation
- Hitbox: invisible capsule named `remote_body_{sessionId}`, `isPickable = true`
- Interpolation speed: 12.0 (lerp per frame)
- Animation LOD: skeleton evaluation paused when out of camera frustum
- Distance culling: `setDormant(true)` hides model + pauses animation beyond cull distance

## Options Menu

`src/client/ui/OptionsMenuUI.ts` — tabbed options panel shared between MainMenuUI and PauseMenuUI.

### Game Tab
- Mouse sensitivity slider (persisted to `fps_mouse_sensitivity`)
- Master volume slider (persisted to `fps_master_volume`)
- Debug overlay toggle (persisted to `fps_debug_mode`)
- Bot settings (main menu only): count slider (1-8), difficulty radio (Easy/Medium/Hard), character radio (Random/X-Bot/Y-Bot/Soldier)

### Graphics Tab
- All settings from `GraphicsSettings` grouped by category: Rendering, Anti-Aliasing, Bloom, Image Processing, Effects
- Booleans rendered as ON/OFF toggle buttons, numbers as slider + value display
- Ragdoll physics toggle
- Reset to Defaults button

## Death & Respawn Flow

### Death
1. Health reaches 0 (bot hit or server `player_killed` message)
2. `PlayerController.die()` — sets health to 0, freezes input (`paused = true`), physics continues
3. Weapon drop spawned at camera position
4. `WeaponManager.onDeath()` — hides viewmodel
5. `CrosshairHUD.hide()`, `DeathOverlay.show(killerName, weaponId)`

### Respawn
1. **Offline:** 3-second `setTimeout` in MatchScene
2. **Online:** Server sends `respawn` message after `RESPAWN_DELAY_MS = 3000ms`
3. Random spawn point selected from `SHIPMENT_SPAWN_POINTS` (8 points)
4. `PlayerController.respawn(position)` — full health restore, unpauses, teleports
5. `WeaponManager.onRespawn()` — restores viewmodel and ammo
6. HUD updated, death overlay hidden

## Hit Detection Pipeline

1. **Client-side raycast** — center-screen ray against scene meshes
2. Hit mesh identified by name: `remote_body_{sessionId}` (networked players) or `remote_body_bot_{N}` (bots)
3. **Online:** Client sends `hit_claim` message with `projectileId, targetSessionId, damage, weaponId`
4. **Server validates:** Checks target exists and is alive, applies damage, broadcasts `hit_confirmed` to attacker and `player_hit` to all
5. **Offline (bots):** Damage applied directly via `BotController.takeDamage()` with proximity-based hit detection (bots use proximity check against player since player has no pickable mesh — only a PhysicsCharacterController capsule)

## Character Models

`src/shared/constants/CharacterConstants.ts` — three Mixamo-rigged character models.

| ID | Display Name | Asset File |
|---|---|---|
| `xbot` | X-Bot | `xbot.glb` |
| `ybot` | Y-Bot | `ybot.glb` |
| `soldier` | Soldier | `character.glb` |

- All share the Mixamo skeleton (`mixamorig:*` bone naming) — animations, ragdoll, and weapon attachments are fully interchangeable
- Default player character: `xbot` (persisted to `fps_loadout_character`)
- Default bot character: `random` (randomly picks per bot, persisted to `fps_bot_character`)

## Bot AI

`src/client/ai/` — NavMesh-based pathfinding with FOV + line-of-sight target acquisition.

### Difficulty Profiles

| Setting | Easy | Medium | Hard |
|---|---|---|---|
| Aim Accuracy | 0.3 | 0.6 | 0.9 |
| Reaction Time | 800 ms | 400 ms | 150 ms |
| Field of View | 60° | 72° | 90° |
| Engage Range | 2000 cm | 3000 cm | 5000 cm |
| Fire Interval | 600 ms | 350 ms | 150 ms |

### Pathfinding (RecastJS NavMesh)
- Package: `recast-detour` (Vite plugin fixes `this["Recast"]` → `globalThis["Recast"]`)
- NavMesh cell size: 20 cm, cell height: 20 cm, walkable height: 180 cm (9 cells), walkable radius: 40 cm
- Meshes included: prefixes `map_`, `boundary_`, `prop_`
- Waypoint threshold: 80 cm, patrol recompute: 5s, path recompute (chasing): 1.5s

### Target Acquisition
- Scan interval: 0.2s (limits raycast cost)
- Checks: distance → FOV cone (horizontal only) → LOS raycast (ignores remote bodies, weapons, projectiles)
- On acquire: reaction timer starts, fire timer randomized to prevent bot sync

### Aim & Firing
- Aim lerp speed: 5.0/s toward target with random spread: `(1 - accuracy) * 0.15 rad`
- Fires only after reaction time elapsed
- Fire interval randomized: 50-150% of base interval
- Bots have infinite ammo reserves (auto-refill)

### Bot Names
Alpha, Bravo, Charlie, Delta, Echo, Foxtrot, Golf, Hotel

## Weapon Stats

### Pistols

| Stat | USP-45 | M9 | Desert Eagle |
|---|---|---|---|
| Damage | 34 | 28 | 55 |
| Fire Rate (RPS) | 6.0 | 7.5 | 3.5 |
| Fire Mode | Semi | Semi | Semi |
| Projectile Speed | 40,000 cm/s | 63,000 cm/s | 57,000 cm/s |
| Magazine | 12 | 15 | 7 |
| Reserve Mags | 4 | 4 | 3 |
| Reload Time | 1.5s | 1.4s | 1.8s |
| Ragdoll Impulse | 800 | 700 | 1,200 |
| Unlock Level | 1 | 3 | 10 |

### Assault Rifles

| Stat | AK-47 | M4A1 | SCAR |
|---|---|---|---|
| Damage | 35 | 30 | 38 |
| Fire Rate (RPS) | 5.0 | 12.0 | 10.0 |
| Fire Mode | Auto | Auto | Auto |
| Projectile Speed | 80,000 cm/s | 85,000 cm/s | 88,000 cm/s |
| Magazine | 30 | 30 | 20 |
| Reserve Mags | 3 | 3 | 3 |
| Reload Time | 2.2s | 2.0s | 2.3s |
| Ragdoll Impulse | 1,000 | 900 | 1,100 |
| Unlock Level | 5 | 8 | 13 |

### Snipers

| Stat | Intervention | Barrett .50 Cal | SVD |
|---|---|---|---|
| Damage | 95 | 100 | 75 |
| Fire Rate (RPS) | 1.0 | 0.8 | 2.5 |
| Fire Mode | Semi | Semi | Semi |
| Projectile Speed | 120,000 cm/s | 130,000 cm/s | 110,000 cm/s |
| Magazine | 5 | 10 | 10 |
| Reserve Mags | 3 | 2 | 3 |
| Reload Time | 3.0s | 3.5s | 2.5s |
| Ragdoll Impulse | 1,500 | 1,800 | 1,400 |
| Unlock Level | 16 | 25 | 20 |

### Unlock Progression

| Level | Weapon |
|---|---|
| 1 | USP-45 |
| 3 | M9 |
| 5 | AK-47 |
| 8 | M4A1 |
| 10 | Desert Eagle |
| 13 | SCAR |
| 16 | Intervention |
| 20 | SVD |
| 25 | Barrett .50 Cal |

## Weapon Sway & Recoil

`src/client/weapons/WeaponSway.ts` — viewmodel animation system driven by player state.

| Parameter | Value |
|---|---|
| State transition lerp | 6.0/s |
| **Idle sway** (figure-8 breathing) | |
| Amplitude X / Y | 0.06 / 0.04 cm |
| Frequency X / Y | 0.2 / 0.3 Hz |
| **Walking sway** (pendulum + bob) | |
| Swing amplitude X | 0.45 cm |
| Bob amplitude Y | 0.15 cm |
| Frequency | 1.8 Hz |
| Roll tilt | 0.005 rad |
| **Recoil** | |
| Kick Z (backward) | -1.5 cm |
| Kick Y (upward) | +0.8 cm |
| Recovery speed | 12.0/s |
| **Airborne** | |
| Jump max Y offset / tilt | -0.5 cm / 0.1 rad |
| Fall max Y offset / tilt | -0.3 cm / 0.06 rad |

## Muzzle Flash

`src/client/weapons/MuzzleFlash.ts` — Babylon.js `ParticleSystem` shared by all weapons.

| Parameter | Value |
|---|---|
| Capacity | 30 particles |
| Burst count | 10 per `flash()` call |
| Particle lifetime | 0.02-0.06s |
| Particle size | 1-4 cm |
| Emit power | 5-15 cm/s |
| Color | Bright yellow → orange → transparent ember |
| Blend mode | Additive |
| Rendering group | 1 (same as viewmodel) |
| Texture | Babylon.js CDN flare |

## Shared Constants

`src/shared/constants/` — 7 files providing game-wide configuration.

| File | Contents |
|---|---|
| `PlayerConstants.ts` | `PLAYER_STATS` (health: 100, speed: 500, jump: 250, capsule: 180×40 cm), sensitivity range/defaults, volume key |
| `WeaponConstants.ts` | `WEAPON_STATS` for all 9 weapons, `WEAPON_UNLOCK_REQUIREMENTS`, `XP_PER_LEVEL` (30-level curve), `XP_PER_KILL` (100) |
| `MapConstants.ts` | `MATCH_DURATION_S` (300s / 5min), `MATCH_RESET_DELAY_MS` (10s), `SHIPMENT_SPAWN_POINTS` (8 points) |
| `BotConstants.ts` | `BOT_DIFFICULTIES` (easy/medium/hard), `BOT_NAMES` (8 NATO phonetic), defaults, localStorage keys |
| `CharacterConstants.ts` | `CHARACTER_MODELS` (3 models), `getCharacterGlb()` resolver, localStorage keys |
| `CollisionGroups.ts` | Havok bitmasks: `WORLD` (0x0001), `PLAYER` (0x0002), `RAGDOLL` (0x0004). Players skip ragdolls, ragdolls hit world only |
| `index.ts` | Barrel re-export (excludes `CollisionGroups`) |

## Pause System

- **Trigger:** P key (NOT ESC — ESC triggers Chromium pointer lock cooldown of ~1.5s; programmatic `exitPointerLock()` has no cooldown)
- **`PlayerController.paused`**: Skips mouse look, movement, and state machine. Physics continues (gravity, collisions — important for networking)
- **PauseMenuUI buttons:** RESUME, OPTIONS (opens `OptionsMenuUI`), MAIN MENU, QUIT GAME (`window.close()`)
- **Flow:** P key → `exitPointerLock()` → show pause menu, hide crosshair, stop footsteps, disable pointer lock, freeze player → RESUME or P again → hide menu, re-enable pointer lock, `requestPointerLock()` → `pointerlockchange` fires → unfreeze player

## Singleton Pattern

| Class | File | Initialized By |
|---|---|---|
| `GameManager` | `src/client/core/GameManager.ts` | `main.ts` |
| `NetworkManager` | `src/client/network/NetworkManager.ts` | MainMenuUI (on connect) |
| `GraphicsSettings` | `src/client/ui/GraphicsSettings.ts` | Self (on first `getInstance()`) |
| `ImGuiManager` | `src/client/ui/ImGuiManager.ts` | GameManager |
| `ProgressionManager` | `src/client/progression/ProgressionManager.ts` | Self (on first `getInstance()`) |

All use `private static _instance` + `static getInstance()` pattern.

## localStorage Keys

All keys use the `fps_` prefix.

| Key | Purpose | Defined In |
|---|---|---|
| `fps_mouse_sensitivity` | Mouse look sensitivity | `PlayerConstants.ts` |
| `fps_master_volume` | Master audio volume | `PlayerConstants.ts` |
| `fps_bot_count` | Number of bots (1-8) | `BotConstants.ts` |
| `fps_bot_difficulty` | Bot AI difficulty preset | `BotConstants.ts` |
| `fps_ragdoll_enabled` | Ragdoll physics toggle | `BotConstants.ts` |
| `fps_loadout_character` | Player character model | `CharacterConstants.ts` |
| `fps_bot_character` | Bot character model | `CharacterConstants.ts` |
| `fps_debug_mode` | Debug overlay toggle | `DebugOverlayUI.ts` |
| `fps_display_name` | Player display name | `MainMenuUI.ts` |
| `fps_last_server_ip` | Last server IP entered | `MainMenuUI.ts` |
| `fps_loadout_slot1` | Weapon slot 1 selection | `CreateClassUI.ts` |
| `fps_loadout_slot2` | Weapon slot 2 selection | `CreateClassUI.ts` |
| `fps_player_xp` | Current XP | `ProgressionManager.ts` |
| `fps_player_level` | Current level | `ProgressionManager.ts` |
| `fps_imgui_scale` | ImGui UI scale factor | `ImGuiManager.ts` |
| `fps_gfx_*` (17 keys) | Graphics pipeline settings | `GraphicsSettings.ts` |
