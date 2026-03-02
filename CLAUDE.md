> Before making any decisions or writing any code, always read TODO.md and README.md in full first.

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
- Character: `public/assets/characters/Animated Base Character.glb`
- Weapons: `public/assets/weapons/{usp,m9,eagle,ak47,m4a1,scar,intervention,50cal,svd}.glb`
- Props: `public/assets/props/{shippingcontainer,jeep,barrel_red,fence_piece,fence_end}.glb`
- Textures: `public/assets/textures/prototype/PNG/{Dark,Green,Light,Orange,Purple,Red}/`
- Crosshairs: `public/assets/textures/crosshair/PNG/{White,Black,Outline}/`
- Audio: `public/assets/audio/player/{pistol,sniper,sniper_lever,footsteps,hitmarker}.mp3`

### Audio Strategy
- `pistol.mp3` → all pistol fire sounds
- `sniper.mp3` → all sniper fire sounds
- `pistol.mp3` also used for rifle fire (universal for now)
- `sniper_lever.mp3` → sniper reload/bolt action
- `footsteps.mp3` → footstep loop
- `hitmarker.mp3` → hit confirmation
- No music, no jump/land/death sounds, no UI sounds, no reload/empty click for now

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
- **GameManager** (`src/client/core/GameManager.ts`) — Singleton owning Engine + Havok WASM, manages scene lifecycle
- **GameScene** (`src/client/core/GameScene.ts`) — Abstract base class; each scene creates its own Babylon Scene
- **InputManager** (`src/client/core/InputManager.ts`) — Keyboard/mouse/pointer lock; jump is one-shot
- **PlayerController** (`src/client/player/PlayerController.ts`) — Havok PhysicsCharacterController capsule, manually driven FreeCamera (inputs.clear()), viewmodel anchor
- **PlayerStateMachine** (`src/client/player/PlayerStateMachine.ts`) — Enum-based: Idle ↔ Walking, both → Jumping → Falling → land
- **WeaponViewmodel** (`src/client/weapons/WeaponViewmodel.ts`) — Loads GLB, parents to camera anchor, rendering group 1 with depth clear
- **CrosshairHUD** (`src/client/ui/CrosshairHUD.ts`) — Babylon GUI AdvancedDynamicTexture fullscreen overlay
- **MatchScene** (`src/client/scenes/MatchScene.ts`) — Shipment map: ground, walls, props, lighting, player spawn
