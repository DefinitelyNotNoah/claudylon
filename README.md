# FPS Game

A multiplayer free-for-all first-person shooter built with Babylon.js and Colyseus.

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Game Engine | Babylon.js | 8.41.0 |
| Physics | Havok (via @babylonjs/havok) | 1.3.10 |
| Networking | Colyseus | TBD |
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
│   │   ├── network/            # Colyseus client, state interpolation
│   │   └── audio/              # Audio manager, spatial audio
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
│       │   ├── player/         # Footsteps, weapon fire, hit marker
│       │   ├── ambient/        # (future) match ambience
│       │   └── ui/             # (future) button clicks, notifications
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

States: `Idle`, `Walking`, `Jumping`, `Falling`, `Firing`, `Reloading`, `Dead`

Architecture TBD — will be implemented as an enum-based state machine with transition validation.

## Progression System

- Local JSON file storage (no database)
- Players start at Level 1
- Weapons unlock at configurable level thresholds
- XP awarded per kill with a balanced curve

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
