> Before making any decisions or writing any code, always read TODO.md, README.md, and this file (CLAUDE.md) in full first.
> After completing any task, always update TODO.md and CLAUDE.md, then commit all changes and push to origin.

## MANDATORY: Documentation Updates

> **CRITICAL — This rule applies to ALL agents (lead and teammates) on EVERY task, no exceptions.**

After completing ANY task (code change, bug fix, feature, refactor, research):
1. **Update TODO.md** — mark completed items `[x]`, add new items discovered during work
2. **Update CLAUDE.md** — if you added a new system, changed architecture, added constants, or made any decision that future sessions need to know about
3. **Commit and push** all changes including doc updates

This is NOT optional. Context windows reset. Documentation is the ONLY persistent memory across sessions. If you don't update docs, work gets lost or duplicated. Every response that involves code changes MUST end with doc updates.

## Agent Teams (Active)

This project uses **Claude Code Agent Teams** for parallel development. Opus is the team lead; teammates are Sonnet instances with specialized roles.

### Team Roles & File Ownership
- **Lead (Opus):** Coordination, architecture, task delegation, synthesis
- **Map Builder (Sonnet):** `src/client/scenes/MatchScene.ts` map construction, `projects/` scene JSON, props, lighting, spawn points
- **Networking Engineer (Sonnet):** `src/client/network/`, `src/server/`, `src/shared/types/` (networking), multiplayer sync, hit validation, keeping singleplayer unnetworked
- **Animator / VFX Dev (Sonnet):** `src/client/weapons/` (WeaponSway, MuzzleFlash, viewmodel), `src/client/debug/MirrorClone.ts`, shaders, visual effects

### Rules for Teammates
- **Do NOT edit files owned by another role** without coordinating through the lead or messaging that teammate
- **Always read CLAUDE.md and TODO.md** before starting work
- **Update TODO.md and CLAUDE.md after every task** (see MANDATORY section above)
- **Commit and push** after completing each task
- **Message the Networking Engineer** whenever adding a feature that needs multiplayer sync
- **Follow all code standards** in this file (JSDoc, explicit types, 4-space indent, OOP)

## Locked-In Decisions

### Tech Stack
- **Game Engine:** Babylon.js 8.41.0
- **Physics:** Havok 1.3.10 (@babylonjs/havok) — capsule-based character controllers, CCD for projectiles
- **Networking:** Colyseus — server-authoritative state sync, room/lobby system, binary delta encoding
- **Bundler:** Vite 7.3.1
- **Language:** TypeScript throughout (client and server)
- **Styling:** Tailwind CSS 4.1.18

### Environment
- **Platform:** Windows 11 (native, NOT WSL)
- **Server hosting:** Local Windows machine, peers connect via Radmin VPN

### Architecture
- **Scene Construction:** All scenes built programmatically in code (not via editor scene files)
- **Editor Role:** Used only as a runtime to launch and test the game
- **Paradigm:** Fully object-oriented — every major concept is a class
- **Code Standards:** JSDoc on all classes/functions, explicit types everywhere, 4-space indentation

### Asset Sources
- **Textures:** Kenney Prototype Textures (CC0), Kenney Crosshair Pack (CC0)
- **3D Props:** PolyPizza (CC-BY, .glb format)
- **Weapon Models:** PolyPizza / sourced individually (.glb)
- **Character Model:** Quaternius "Animated Base Character" (.glb, includes animations)
- **Audio:** Sourced individually (.mp3)
- **Fonts:** Google Fonts (Rajdhani / Orbitron)

### Weapon Roster (Finalized)
- **Pistols:** USP-45 (`usp.glb`), M9 (`m9.glb`), Desert Eagle (`eagle.glb`)
- **Assault Rifles:** AK-47 (`ak47.glb`), M4A1 (`m4a1.glb`), SCAR (`scar.glb`)
- **Snipers:** Intervention (`intervention.glb`), Barrett .50 Cal (`50cal.glb`), SVD (`svd.glb`)
- M16 replaced by AK-47

### Asset File Mapping
- Character: `public/assets/characters/{Animated Base Character,xbot,ybot,character}.glb`
- Weapons: `public/assets/weapons/{usp,m9,eagle,ak47,m4a1,scar,intervention,50cal,svd}.glb`
- Props: `public/assets/props/{shippingcontainer,jeep,barrel_red,fence_piece,fence_end}.glb`
- Textures: `public/assets/textures/prototype/PNG/{Dark,Green,Light,Orange,Purple,Red}/`
- Crosshairs: `public/assets/textures/crosshair/PNG/{White,Black,Outline}/`
- Audio (weapons): `public/assets/audio/weapons/{pistol,rifle,sniper,sniper_lever}.mp3`
- Audio (player): `public/assets/audio/player/{footsteps,hitmarker}.mp3`
- Audio (ambient): `public/assets/audio/ambient/{wind,warfare_2,land,empty_click,reload_rifle}.mp3`
- Audio (UI): `public/assets/audio/ui/{levelup}.mp3`

### Audio Strategy
- `pistol.mp3` → all pistol fire sounds
- `rifle.mp3` → all rifle fire sounds
- `sniper.mp3` → all sniper fire sounds
- `sniper_lever.mp3` → sniper reload/bolt action (plays 0.4s after sniper fire)
- `footsteps.mp3` → footstep loop (manual looping via `onEndedObservable`)
- `hitmarker.mp3` → hit confirmation
- `empty_click.mp3` → empty magazine click (0.4s cooldown, triggers auto-reload)
- `reload_rifle.mp3` → reload sound (manual R-press and auto-reload)
- `land.mp3` → landing sound (requires ≥150ms airborne)
- `wind.mp3` → ambient wind loop (0.15 vol)
- `warfare_2.mp3` → ambient warfare bursts (random 10-20s intervals, 0.12 vol)
- `levelup.mp3` → level up notification sound
- No music, no jump sounds, no per-weapon reload sounds, no UI button sounds

### Naming Conventions (Scene Nodes)
- Spawn points: `spawn_point_{n}`
- Map geometry: `map_{description}`
- Cover / props: `prop_{type}_{n}`
- Lights: `light_{type}_{n}`
- Cameras: `camera_{purpose}`
- Boundaries: `boundary_{side}`
- Materials: `mat_{surface}`

### World Scale
- Centimeters: gravity = (0, -981, 0), player height = 180 cm
- Shipment map: 3000×3000 cm. Playground map: 5000×5000 cm
- GLB models authored in meters should be scaled by 100

### Map Layouts (Current)
- **Shipment:** Container rows at Z=±750 (6 containers each, E-W aligned) + mid row at Z=0 (4 containers, N-S perpendicular). Stacked containers at NW (Z=+750) and SE (Z=-750) for elevated positions. Jeeps in west/east alleys at mid-point. Barrel clusters at spawn approaches + center junctions. Fence rows at Z=±1350 seal outer corridors. 6 spawn points: four corners + two mid-side pockets. Lighting: warm NW directional sun, overcast grey-blue sky, light haze fog (EXP2, density=0.00006).
- **Playground:** Platforms at varying heights (120/240/420 cm), ramps to mid platforms, L-shaped cover walls, 2 containers at map edges. 8 spawn points at corners and cardinal edges. Lighting: bright midday sun from SE + cool fill light, sky-blue clearColor, atmospheric fog (EXP2, density=0.000035).

### Core Architecture (Implemented)
- **GameManager** (`src/client/core/GameManager.ts`) — Singleton owning Engine + Havok WASM, manages scene lifecycle, initializes ImGuiManager
- **GameScene** (`src/client/core/GameScene.ts`) — Abstract base class; each scene creates its own Babylon Scene
- **InputManager** (`src/client/core/InputManager.ts`) — Keyboard/mouse/pointer lock; jump is one-shot; L key for ImGui toggle; Q/E lean hold inputs; F interact
- **PlayerController** (`src/client/player/PlayerController.ts`) — Havok PhysicsCharacterController capsule, manually driven FreeCamera (inputs.clear()), viewmodel anchor, leaning system (Q/E)
- **PlayerStateMachine** (`src/client/player/PlayerStateMachine.ts`) — Enum-based: Idle ↔ Walking, both → Jumping → Falling → land
- **WeaponManager** (`src/client/weapons/WeaponManager.ts`) — Manages weapon switching, firing, reloading, ammo, viewmodel, sway, muzzle flash
- **WeaponViewmodel** (`src/client/weapons/WeaponViewmodel.ts`) — Loads GLB, parents to camera anchor, rendering group 1 with depth clear
- **AudioManager** (`src/client/audio/AudioManager.ts`) — Singleton, pooled Sound instances (6 per file), spatial 3D audio, footstep/ambient systems
- **NetworkManager** (`src/client/network/NetworkManager.ts`) — Singleton, Colyseus client connection, room management
- **BotManager** (`src/client/ai/BotManager.ts`) — Creates NavigationManager + BotControllers + RemotePlayer visuals, bot projectiles
- **BotController** (`src/client/ai/BotController.ts`) — NavMesh pathfinding, FOV + LOS target acquisition, reaction time, aim lerp
- **ProgressionManager** (`src/client/progression/ProgressionManager.ts`) — Singleton, XP/level tracking, weapon unlocks, localStorage persistence
- **ImGuiManager** (`src/client/ui/ImGuiManager.ts`) — Singleton, Dear ImGui overlay canvas, hooks into engine render loop
- **GraphicsSettings** (`src/client/ui/GraphicsSettings.ts`) — Singleton, manages DefaultRenderingPipeline, localStorage persistence
- **CrosshairHUD** (`src/client/ui/CrosshairHUD.ts`) — Babylon GUI AdvancedDynamicTexture fullscreen overlay
- **MirrorClone** (`src/client/debug/MirrorClone.ts`) — Debug RemotePlayer that mirrors local player position, rotation, weapon, firing, and leaning; uses onAfterAnimationsObservable for bone rotation
- **MatchScene** (`src/client/scenes/MatchScene.ts`) — Delegates map construction to a MapBuilder, spawns player, manages bots and ImGui
- **MapBuilder** (`src/client/maps/MapBuilder.ts`) — Abstract base; `build()` returns `{ spawnPoints, shadowGenerator }`
- **ShipmentMap** (`src/client/maps/ShipmentMap.ts`) — Compact shipping yard (3000×3000 cm), extracted from MatchScene
- **PlaygroundMap** (`src/client/maps/PlaygroundMap.ts`) — Large test arena (5000×5000 cm), platforms, ramps, cover walls
- **MapFactory** (`src/client/maps/MapFactory.ts`) — `createMapBuilder(mapId, scene)` factory function
- **MapRegistry** (`src/shared/constants/MapRegistry.ts`) — `MAP_REGISTRY` array, `MapId` type, `SELECTED_MAP_KEY` localStorage key
- **MainMenuScene** (`src/client/scenes/MainMenuScene.ts`) — Main menu with map selection, Host/Join/Offline buttons, options, create-a-class
- **LobbyScene** (`src/client/scenes/LobbyScene.ts`) — Pre-game lobby with player list and host start

### ImGui Debug Panel
- **Toggle:** L key (works in all scenes, even when input suppressed)
- **Package:** `@mori2003/jsimgui` v0.13.0 — Dear ImGui JS bindings, WebGL2 canvas overlay
- **Architecture:** Separate `<canvas>` at z-index 100 with `pointer-events: none`; document-level mouse/keyboard listeners feed ImGui IO directly
- **Tab modules:** `src/client/ui/imgui/` — each tab is a standalone draw function with a context interface
- **Tabs:** Player, Bots, Weapons, Audio, Graphics, Physics, Progression, Performance, Mirror, Settings
- **Adding a tab:** Create `src/client/ui/imgui/MyTab.ts` with context interface + `drawMyTab(ctx)`, wire in MatchScene draw callback

### Networking (Colyseus 0.17)
- **Server:** Separate Node.js process via `npm run server` (tsx), port 2567
- **Rooms:** LobbyRoom (pre-game) → MatchRoom (gameplay), max 10 clients
- **State sync:** 20Hz (patchRate 50ms), position interpolation at 12x lerp
- **Hit detection:** Client-side raycast → `hit_claim` → server validates → `hit_confirmed`
- **Hit validation / anti-cheat (MatchRoom):**
  - Damage must exactly match `WEAPON_STATS[weaponId].damage`
  - Projectile ID deduplication via `_claimedProjectileIds: Set<string>` (force-pruned at 2000; interval-pruned every 30s)
  - Fire rate limit via `_lastHitClaimTime: Map<sessionId, ms>` — enforces `max(60ms, 70% of weapon fire interval)` between claims per attacker
  - Distance cap: attacker → target ≤ 10000cm (covers all map diagonals with lag headroom)
  - Dead/alive, self-hit, unknown weapon checks
- **Weapon + reload state sync:** `_sendNetworkUpdate` sends `PlayerStateEnum.Reloading` when `weapon.isReloading`, overriding movement state so remote `CharacterModel.setState()` gets the correct state
- **Schema:** `@type()` decorated fields MUST use `declare` keyword (prevents field initializer overwrite)
- **Optional:** MatchScene checks `NetworkManager.isInMatch`, offline works without server
- **Lean sync (implemented):** `leanAmount` (-1..1) is in `PlayerSchema` (`@type("float32") declare leanAmount`), `PlayerUpdateData`, sent every network tick from `_sendNetworkUpdate`, applied to remote players via `RemotePlayer._applyTorsoLean()` using `onAfterAnimationsObservable` — same bone-rotation technique as MirrorClone

### Progression
- **Max level:** 30, XP formula: `100 * (level + 1)^1.5` per level
- **XP per kill:** 100 (configurable via `XP_PER_KILL`)
- **Weapons unlock** at level thresholds defined in `WEAPON_UNLOCK_REQUIREMENTS`
- **Create-a-Class:** 4 preset loadouts + custom, locked weapons greyed out

### Leaning System
- **Keys:** Q (lean left), E (lean right) — hold to lean, release to return upright
- **Camera:** Quaternion-based rotation (`Yaw * Pitch * Roll`) to avoid gimbal lock — Euler rotation with non-zero roll causes axis coupling
- **Separate POV vs Model parameters (tunable via Mirror ImGui tab):**
  - **POV (camera):** `maxLeanAngle` 10° (0.1745 rad), `leanSpeed` 8/s, `leanOffset` 50cm
  - **Model (3rd person):** `modelMaxLeanAngle` 30° (0.524 rad), `modelLeanSpeed` 8/s, `modelLeanOffset` 30cm, `torsoLeanRatio` 1.45
- **Viewmodel:** WeaponSway receives `leanAmount` param, applies sideways shift (3.0 units) + tilt (0.08 rad)
- **Interact key:** F (not E, which is lean right)

### VFX System
- **Directory:** `src/client/vfx/`
- **JumpSmokeEffect** (`src/client/vfx/JumpSmokeEffect.ts`) — cartoon smoke puff particle burst at a character's feet when they jump
  - Uses Babylon.js `ParticleSystem` with `manualEmitCount` burst mode (no continuous emit rate)
  - 12 particles per burst, lifetime 0.25-0.45s, starts 8-18cm radius expanding to 48cm, alpha fades to 0
  - Light gray color, `BLENDMODE_STANDARD`, slight upward gravity drift (20 cm/s), radial outward spread (40-90 cm/s)
  - `SizeGradient` and `ColorGradient` animate scale and alpha over particle lifetime
  - Emitter position updated each call via `position.clone()` — single particle system instance reused per character
  - Disposal: `dispose()` frees GPU resources; MatchScene disposes all smoke instances in its `dispose()` method
- **BulletSparkEffect** (`src/client/vfx/BulletSparkEffect.ts`) — bright additive spark burst at bullet impact points on hard surfaces
  - 14 particles, BLENDMODE_ADD, fast emit (80-250 cm/s), heavy gravity (-400 cm/s²), shrinks to 0 at end of life
  - `direction1`/`direction2` biased toward surface normal each `play()` call
  - Single instance per WeaponManager, reused for all wall/prop hits
- **BloodSplatterEffect** (`src/client/vfx/BloodSplatterEffect.ts`) — dark-red particle burst for character body hits
  - 10 particles, BLENDMODE_STANDARD, deep red with ColorGradient fade to transparent, heavy gravity (-600 cm/s²)
  - Single instance per WeaponManager, reused for all player/bot hits
- **MatchScene integration:** `_updateJumpSmoke()` called each frame, detects `Idle/Walking → Jumping` state transition for local player and all bots; bot smoke effects are lazily created on first jump
- **WeaponManager integration:** `_updateProjectiles()` dispatches `BulletSparkEffect.play()` for wall hits and `BloodSplatterEffect.play()` for `remote_body_*` hits
- **Future:** Jump smoke for networked remote players pending Networking teammate exposing jump state in sync

### MuzzleFlash (Improved)
- **File:** `src/client/weapons/MuzzleFlash.ts`
- **Per-weapon-class:** Constructor takes `WeaponCategory` — pistol/rifle/sniper differ in particle count, size, power, and light intensity/range
- **Point light:** `PointLight` parented to emitter, warm orange-yellow (1.0, 0.8, 0.4), quadratic fade in `update(dt)` over 40ms
- **API:** `flash()` triggers burst + lights; `update(dt)` fades light; `setCategory(cat)` updates class at runtime (called on weapon switch)
- **WeaponManager:** calls `_muzzleFlash.update(dt)` each frame, `setCategory()` after `_switchToSlot()`, passes `category` to constructor

### WeaponSway (Polished)
- **File:** `src/client/weapons/WeaponSway.ts`
- **Walk bob:** Figure-8 pattern — `|sin|*0.6 + sin(2x)*0.4` for natural footstep rhythm
- **Idle breathing:** Asymmetric dual-frequency — two sine waves at different non-integer ratios per axis
- **Recoil:** `recoilKickSnap` (default 0.35) splits kick into instant snap + spring remainder for snappy-but-smooth feel
- **Mouse-lag drag:** Optional `FreeCamera` param in `update()` — tracks camera yaw/pitch delta, applies inverse offset, recovers via lerp; clamped to ±1.8cm/±1.2cm
- **MatchScene:** Call site updated to pass `this._playerController.camera` as 5th argument

### Mirror Clone Debug Tool
- **File:** `src/client/debug/MirrorClone.ts` — spawns a RemotePlayer that mirrors local player
- **Features:** Position tracking, weapon sync, fire sync (recoil + spatial audio), torso lean
- **Lean sync:** Uses `onAfterAnimationsObservable` to apply quaternion rotation to spine bones (Spine, Spine1, Spine2) AFTER animation evaluation — prevents animations from overwriting
- **Lean axis:** Derived from Head bone's world-space forward direction (horizontal projection), transformed into each spine bone's parent local space — accounts for animation pose offset (gun-holding stance)
- **Model lean:** Own `modelMaxLeanAngle` (30°) independent of POV camera angle, scaled by `torsoLeanRatio` (default 1.45)
- **ImGui tab:** `src/client/ui/imgui/MirrorTab.ts` — spawn/despawn, offset distance, collision toggle, rotation lock, separate POV + Model leaning sections
