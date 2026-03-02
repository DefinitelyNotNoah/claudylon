/**
 * Lobby UI overlay showing connected players and host controls.
 * Built on Babylon.js GUI AdvancedDynamicTexture.
 * @module client/ui/LobbyUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";

/** Button width in pixels. */
const BUTTON_WIDTH = "300px";

/** Button height in pixels. */
const BUTTON_HEIGHT = "60px";

/** Player info passed to the UI. */
export interface LobbyPlayerInfo {
    /** Colyseus session ID. */
    sessionId: string;
    /** Display name. */
    displayName: string;
    /** Whether the player has readied up. */
    isReady: boolean;
}

/**
 * Creates a styled lobby button matching the MainMenuUI pattern.
 * @param name - Control name.
 * @param label - Button text.
 * @param onClick - Click handler.
 * @returns Configured Button control.
 */
function createLobbyButton(name: string, label: string, onClick: () => void): Button {
    const btn = Button.CreateSimpleButton(name, label);
    btn.width = BUTTON_WIDTH;
    btn.height = BUTTON_HEIGHT;
    btn.color = "white";
    btn.fontSize = 22;
    btn.fontFamily = "Rajdhani, sans-serif";
    btn.background = "rgba(255,255,255,0.1)";
    btn.cornerRadius = 4;
    btn.thickness = 1;
    btn.paddingTop = "8px";
    btn.paddingBottom = "8px";

    btn.onPointerEnterObservable.add(() => {
        btn.background = "rgba(255,255,255,0.2)";
    });
    btn.onPointerOutObservable.add(() => {
        btn.background = "rgba(255,255,255,0.1)";
    });
    btn.onPointerUpObservable.add(onClick);

    return btn;
}

/**
 * Lobby scene UI. Shows connected players and host controls.
 */
export class LobbyUI {
    private _advancedTexture: AdvancedDynamicTexture;
    private _playerListPanel: StackPanel;
    private _playerCountText: TextBlock;
    private _startButton: Button;

    /**
     * Creates the lobby UI overlay.
     * @param scene - The Babylon.js scene.
     * @param isHost - Whether the local player is the host.
     * @param onStartGame - Callback for the Start Game button (host only).
     * @param onLeave - Callback for the Leave button.
     */
    constructor(
        scene: Scene,
        isHost: boolean,
        onStartGame: () => void,
        onLeave: () => void,
    ) {
        this._advancedTexture = createFullscreenUI("lobby_ui", scene);

        /* Semi-transparent dark overlay */
        const overlay = new Rectangle("lobby_overlay");
        overlay.width = 1;
        overlay.height = 1;
        overlay.background = "rgba(0,0,0,0.4)";
        overlay.thickness = 0;
        this._advancedTexture.addControl(overlay);

        /* Centered content panel */
        const panel = new StackPanel("lobby_panel");
        panel.width = "400px";
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._advancedTexture.addControl(panel);

        /* Title */
        const title = new TextBlock("lobby_title", "LOBBY");
        title.color = "white";
        title.fontSize = 40;
        title.fontFamily = "Orbitron, sans-serif";
        title.height = "70px";
        title.paddingBottom = "10px";
        panel.addControl(title);

        /* Player count */
        this._playerCountText = new TextBlock("player_count", "Players: 0/10");
        this._playerCountText.color = "rgba(255,255,255,0.6)";
        this._playerCountText.fontSize = 16;
        this._playerCountText.fontFamily = "Rajdhani, sans-serif";
        this._playerCountText.height = "30px";
        this._playerCountText.paddingBottom = "20px";
        panel.addControl(this._playerCountText);

        /* Player list container */
        const listContainer = new Rectangle("list_container");
        listContainer.width = "350px";
        listContainer.height = "250px";
        listContainer.background = "rgba(0,0,0,0.3)";
        listContainer.thickness = 1;
        listContainer.color = "rgba(255,255,255,0.2)";
        listContainer.cornerRadius = 4;
        listContainer.paddingBottom = "20px";
        panel.addControl(listContainer);

        this._playerListPanel = new StackPanel("player_list");
        this._playerListPanel.width = "340px";
        this._playerListPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._playerListPanel.paddingTop = "10px";
        listContainer.addControl(this._playerListPanel);

        /* Spacer */
        const spacer = new Rectangle("lobby_spacer");
        spacer.height = "15px";
        spacer.thickness = 0;
        spacer.background = "transparent";
        panel.addControl(spacer);

        /* Start Game button (host only) */
        this._startButton = createLobbyButton("btn_start_game", "START GAME", onStartGame);
        this._startButton.isVisible = isHost;
        panel.addControl(this._startButton);

        /* Spacer */
        const spacer2 = new Rectangle("lobby_spacer2");
        spacer2.height = "10px";
        spacer2.thickness = 0;
        spacer2.background = "transparent";
        panel.addControl(spacer2);

        /* Leave button */
        panel.addControl(createLobbyButton("btn_leave", "LEAVE", onLeave));
    }

    /**
     * Updates the player list display.
     * @param players - Array of player info objects.
     * @param isHost - Whether the local player is currently the host.
     */
    public updatePlayers(players: LobbyPlayerInfo[], isHost: boolean): void {
        // Clear existing player entries
        const children = this._playerListPanel.children.slice();
        for (const child of children) {
            this._playerListPanel.removeControl(child);
            child.dispose();
        }

        // Update player count
        this._playerCountText.text = `Players: ${players.length}/10`;

        // Add player entries
        for (const player of players) {
            const entry = new TextBlock(
                `player_${player.sessionId}`,
                player.displayName,
            );
            entry.color = "white";
            entry.fontSize = 18;
            entry.fontFamily = "monospace";
            entry.height = "28px";
            entry.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            entry.paddingLeft = "10px";
            this._playerListPanel.addControl(entry);
        }

        // Show/hide start button based on host status
        this._startButton.isVisible = isHost;
    }

    /**
     * Disposes the GUI texture and all controls.
     */
    public dispose(): void {
        this._advancedTexture.dispose();
    }
}
