> Before making any decisions or writing any code, always read TODO.md and README.md in full first.
> After completing any plan implementation, always commit all changes and push to origin.

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
- Centimeters: gravity = (0, -981, 0), player height = 180 cm, map = 3000x3000 cm
- GLB models authored in meters should be scaled by 100

### Core Architecture (Implemented)
- **GameManager** (`src/client/core/GameManager.ts`) — Singleton owning Engine + Havok WASM, manages scene lifecycle, initializes ImGuiManager
- **GameScene** (`src/client/core/GameScene.ts`) — Abstract base class; each scene creates its own Babylon Scene
- **InputManager** (`src/client/core/InputManager.ts`) — Keyboard/mouse/pointer lock; jump is one-shot; L key for ImGui toggle
- **PlayerController** (`src/client/player/PlayerController.ts`) — Havok PhysicsCharacterController capsule, manually driven FreeCamera (inputs.clear()), viewmodel anchor
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
- **MatchScene** (`src/client/scenes/MatchScene.ts`) — Shipment map: ground, walls, props, lighting, player spawn, bot management, ImGui integration
- **MainMenuScene** (`src/client/scenes/MainMenuScene.ts`) — Main menu with Host/Join/Offline buttons, options, create-a-class
- **LobbyScene** (`src/client/scenes/LobbyScene.ts`) — Pre-game lobby with player list and host start

### ImGui Debug Panel
- **Toggle:** L key (works in all scenes, even when input suppressed)
- **Package:** `@mori2003/jsimgui` v0.13.0 — Dear ImGui JS bindings, WebGL2 canvas overlay
- **Architecture:** Separate `<canvas>` at z-index 100 with `pointer-events: none`; document-level mouse/keyboard listeners feed ImGui IO directly
- **Tab modules:** `src/client/ui/imgui/` — each tab is a standalone draw function with a context interface
- **Tabs:** Player, Bots, Weapons, Audio, Graphics, Physics, Progression, Performance, Settings
- **Adding a tab:** Create `src/client/ui/imgui/MyTab.ts` with context interface + `drawMyTab(ctx)`, wire in MatchScene draw callback

### Networking (Colyseus 0.17)
- **Server:** Separate Node.js process via `npm run server` (tsx), port 2567
- **Rooms:** LobbyRoom (pre-game) → MatchRoom (gameplay), max 10 clients
- **State sync:** 20Hz (patchRate 50ms), position interpolation at 12x lerp
- **Hit detection:** Client-side raycast → `hit_claim` → server validates → `hit_confirmed`
- **Schema:** `@type()` decorated fields MUST use `declare` keyword (prevents field initializer overwrite)
- **Optional:** MatchScene checks `NetworkManager.isInMatch`, offline works without server

### Progression
- **Max level:** 30, XP formula: `100 * (level + 1)^1.5` per level
- **XP per kill:** 100 (configurable via `XP_PER_KILL`)
- **Weapons unlock** at level thresholds defined in `WEAPON_UNLOCK_REQUIREMENTS`
- **Create-a-Class:** 4 preset loadouts + custom, locked weapons greyed out
