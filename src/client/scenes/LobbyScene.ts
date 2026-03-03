/**
 * Lobby scene. UI-only (no 3D world). Shows connected players
 * and allows the host to start the game.
 * @module client/scenes/LobbyScene
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";

import { GameScene } from "../core/GameScene";
import { GameManager } from "../core/GameManager";
import { LobbyUI, type LobbyPlayerInfo } from "../ui/LobbyUI";
import { NetworkManager } from "../network/NetworkManager";
import { MatchScene } from "./MatchScene";
import { MainMenuScene } from "./MainMenuScene";

/** localStorage key for persisted display name. */
const DISPLAY_NAME_KEY = "fps_display_name";

/**
 * Pre-game lobby scene. Displays a player list and host controls.
 * No 3D rendering — just a dark background with GUI overlay.
 */
export class LobbyScene extends GameScene {
    private _lobbyUI: LobbyUI | null = null;
    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;

    /**
     * Initializes the lobby scene with a dark background and GUI.
     */
    public async initialize(): Promise<void> {
        this._scene.clearColor = new Color4(0.08, 0.08, 0.12, 1.0);

        // Minimal camera required for the scene to render GUI
        const camera = new FreeCamera("camera_lobby", Vector3.Zero(), this._scene);
        camera.inputs.clear();
        this._scene.activeCamera = camera;

        const network = NetworkManager.getInstance();
        const lobbyState = (network.lobbyRoom as any)?.state;
        const isHost = lobbyState?.hostId === network.sessionId;

        this._lobbyUI = new LobbyUI(
            this._scene,
            isHost,
            () => {
                network.startGame();
            },
            () => {
                network.disconnect();
                GameManager.getInstance().loadScene(MainMenuScene);
            },
        );

        // Listen for lobby state changes to update player list
        network.onLobbyStateChange = (state: any) => {
            const players: LobbyPlayerInfo[] = [];
            state.players.forEach((player: any, sessionId: string) => {
                players.push({
                    sessionId,
                    displayName: player.displayName,
                    isReady: player.isReady,
                });
            });

            const newIsHost = state.hostId === network.sessionId;
            this._lobbyUI?.updatePlayers(players, newIsHost);
        };

        // L toggles ImGui overlay
        this._onKeyDown = (e: KeyboardEvent) => {
            if (e.code === "KeyL") {
                this._manager.imguiManager.toggle();
            }
        };
        window.addEventListener("keydown", this._onKeyDown);

        // Listen for game starting
        network.onGameStarting = async () => {
            const displayName = localStorage.getItem(DISPLAY_NAME_KEY) || "Player";
            await network.joinMatch(displayName);
            GameManager.getInstance().loadScene(MatchScene);
        };
    }

    /**
     * Disposes the lobby UI and cleans up network callbacks.
     */
    public override dispose(): void {
        if (this._onKeyDown) {
            window.removeEventListener("keydown", this._onKeyDown);
        }
        this._manager.imguiManager.setDrawCallback(null);
        const network = NetworkManager.getInstance();
        network.onLobbyStateChange = null;
        network.onGameStarting = null;
        this._lobbyUI?.dispose();
        super.dispose();
    }
}
