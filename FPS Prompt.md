# FPS Game — Project Brief

## Pre-Development Decisions

Before writing any code, provide your recommendations and justifications for each of the following, then **wait for my approval before proceeding**:

1. **Game Engine** — Recommend a TypeScript-compatible engine (e.g., Babylon.js, PlayCanvas) that natively supports Audio, Scene management, Physics, and Anti-aliasing. We are open to moving away from Three.js if a better-suited engine exists for this scope.
2. **Physics System** — Recommend a physics library compatible with your chosen engine (e.g., Havok, Cannon.js, Rapier). Character controllers should be capsule-based.
3. **Networking Backend** — Choose between **Colyseus** or **Socket.io** and justify which is better suited for a real-time multiplayer FPS. Library size and weight are not a concern.
4. **Asset Sources** — We are considering **Kenney's Prototype Textures** and **PolyPizza** for free 3D models and textures. Confirm these or suggest better alternatives.
5. **Port Exposure (WSL + Radmin VPN)** — I am developing on WSL and will host the game server locally. My friends connect via a **Radmin VPN** network. Explain how to properly expose the server port from WSL so that Radmin VPN peers can connect.

---

## Asset Manifest (Resolve Before Any Development)

Before writing a single line of code, produce a **complete asset manifest** listing every file you will need from me, organized by category. For each asset, specify the expected filename, format, and how it will be used. This includes but is not limited to:

- **Weapon models** (one per weapon listed below)
- **Weapon textures** (albedo, normal, roughness where applicable)
- **Map geometry / props** (Shipment-inspired layout)
- **Map textures**
- **Player/character model**
- **Audio** — firing sounds, footsteps, reload, ambient, UI sounds
- **UI assets** — any icons, fonts, or HUD elements

At the end of development, if any assets are missing or still needed, explicitly remind me.

---

## Game Scenes

### 1. Main Menu
- Displays a **Start Game** button that opens a **server browser** listing available lobbies
- Mouse sensitivity slider (persisted to local storage or local config file)

### 2. Lobby
- UI-only scene (no 3D rendering)
- Displays connected players
- Host has a **Start Game** button; all other players wait

### 3. Match (Free-for-All)
- Fully playable FPS map
- Players can move, jump, and fire
- **Projectiles are physical objects** — not hitscan. They travel through the scene and are affected by the physics system.
- Boundaries enforced to keep players within map limits

---

## Map Design

- Keep geometry **extremely simple** to start
- First map is loosely inspired by **Shipment** from Call of Duty: a small, symmetrical, open layout with crates/containers as cover
- Textures will be sourced from Kenney's Prototype pack and applied to basic geometries
- 3D props (crates, barriers, etc.) sourced from PolyPizza or equivalent

---

## Multiplayer & Networking

- Backend: **Colyseus or Socket.io** (per your recommendation above)
- Players connect via **Radmin VPN** — the host runs the server locally on their WSL machine
- The server must be reachable by Radmin VPN peers (explain the exact setup needed)
- All player state (position, rotation, health, weapon) must be synchronized

---

## AI / Bot System

- Bots navigate the map using a **pathfinding system** (e.g., navmesh or waypoint graph — recommend which suits the engine)
- Behavior: Bots patrol the map, and upon acquiring line-of-sight to a target (player or other bot), they open fire
- Bots are treated as first-class entities — they share the same Player stats and weapon system as human players

---

## Weapons

Three classes, three weapons each. All stats defined below.

**Weapon Stats (per weapon object):**
- `damage: number`
- `fireRate: number` (rounds per minute or shots per second — your call, be consistent)
- `projectileSize: number`
- `magazineCount: number`
- `magazineSize: number`
- `fireMode: 'automatic' | 'burst' | 'semi'`

### Pistols
| Weapon | Fire Mode |
|---|---|
| USP-45 | Semi |
| M9 | Semi |
| Desert Eagle | Semi |

### Assault Rifles
| Weapon | Fire Mode |
|---|---|
| M16 | 3-Round Burst |
| M4A1 | Automatic |
| SCAR | Automatic |

### Snipers
| Weapon | Fire Mode |
|---|---|
| Intervention (MW2) | Semi |
| Barrett .50 Cal | Semi |
| SVD | Semi |

---

## Player Stats

```typescript
interface PlayerStats {
    health: number;
    movementSpeed: number;
    jumpHeight: number;
}
```

---

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Look (adjustable sensitivity) |
| `1` | Equip Weapon Slot 1 |
| `2` | Equip Weapon Slot 2 |
| `Left Click` | Fire |
| `R` | Reload |
| `Space` | Jump |

---

## Progression System

- All progression data is stored **locally** in the directory the executable is launched from (flat file, JSON preferred — no database)
- Players start at **Level 1**
- Weapons are unlocked at configurable level thresholds, defined in a single array of objects so they are easy to edit:

```typescript
const WEAPON_UNLOCK_REQUIREMENTS = [
    { weaponId: 'usp45',       unlockLevel: 1  },
    { weaponId: 'm9',          unlockLevel: 3  },
    { weaponId: 'desertEagle', unlockLevel: 6  },
    // ... etc.
];
```

- XP is awarded per kill — recommend a balanced XP curve and explain your reasoning

---

## Player State Machine

Implement a formal state machine for player states. You decide the architecture (enum + switch, class-based, or a library) based on game development best practices. At minimum, cover these states:

- `Idle`
- `Walking`
- `Jumping`
- `Falling`
- `Firing`
- `Reloading`
- `Dead`

---

## Code Standards

- **Language:** TypeScript throughout (client and server)
- **Paradigm:** Fully object-oriented — every major concept (Player, Weapon, Projectile, Bot, Scene, etc.) is a class
- **Comments:** Every class and every function must have a JSDoc comment explaining its purpose, parameters, and return value
- **Type annotations:** Explicit types everywhere — no implicit `any`
- **Indentation:** 4 spaces (no double-spacing between lines)
- **Anti-aliasing:** Maximize use of whatever the chosen engine provides

---

## Living Documents

Maintain the following three files throughout the entire development process:

1. **`CLAUDE.md`** — Your self-maintained decisions log. At project initialization, create this file with the following line at the top, and nothing else:
    > Before making any decisions or writing any code, always read TODO.md and README.md in full first.

    From that point on, update `CLAUDE.md` progressively as major decisions get locked in (e.g., tech stack finalized, folder structure settled, architectural patterns agreed upon). This file should be **stable and authoritative** — only updated when something significant and permanent has been decided, not during routine development. You should flag when something warrants being added here and update it automatically without waiting to be asked.

2. **`README.md`** — Explains every component, system, and architectural decision in the project. This file is **critical** and must be updated progressively and consistently as systems are built and completed. It should never fall out of sync with the actual state of the codebase. Before making any architectural decision, implementation choice, or structural change, `README.md` must be read in full to ensure the decision is consistent with what has already been established. Failing to do so risks introducing contradictions, duplicate systems, or decisions that conflict with prior agreements.

3. **`TODO.md`** — Tracks everything not yet implemented, with clear task descriptions. This file is **critical** and must be updated actively and continuously throughout every session — not just at the end. Every time a task is completed, it must be marked off immediately. Every time a new requirement, bug, or missing piece is identified, it must be added immediately. `TODO.md` is the single source of truth for what remains to be done, and it must always reflect the current state of the project accurately. Before making any decision or starting any task, `TODO.md` must be read in full to understand what has and hasn't been completed yet.

### Session Continuity

At the start of every session:
1. Read `CLAUDE.md` first
2. `CLAUDE.md` will instruct you to read `TODO.md` and `README.md` in full
3. Only after reading all three should you make any decisions or write any code

This ensures full project context is restored automatically, even after a context window expiry, without requiring any manual intervention from the user. **Under no circumstances should any code be written, any decision be made, or any task be started without first consulting all three files.** Skipping this step risks duplicating work, contradicting prior decisions, or building on a misunderstood foundation.

---

## How to Begin

1. Answer all **Pre-Development Decisions** above
2. Produce the complete **Asset Manifest**
3. Await my approval on both
4. Then and only then, begin scaffolding the project
