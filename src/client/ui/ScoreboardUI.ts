/**
 * TAB-held scoreboard overlay showing all player stats.
 * Displays player names, kills, and deaths sorted by kills descending.
 * @module client/ui/ScoreboardUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";

/**
 * Data for a single scoreboard row.
 */
export interface ScoreboardEntry {
    /** Player's session ID. */
    sessionId: string;
    /** Player's display name. */
    displayName: string;
    /** Total kills this match. */
    kills: number;
    /** Total deaths this match. */
    deaths: number;
    /** Whether this is the local player. */
    isLocal: boolean;
}

/**
 * Full-screen scoreboard overlay shown while TAB is held.
 * Displays all players sorted by kills descending.
 */
export class ScoreboardUI {
    private _texture: AdvancedDynamicTexture;
    private _root: Rectangle;
    private _rowsPanel: StackPanel;
    private _titleText: TextBlock;
    private _countdownText: TextBlock;

    /**
     * Creates the scoreboard UI.
     * @param scene - The Babylon.js scene.
     */
    constructor(scene: Scene) {
        this._texture = createFullscreenUI("scoreboard_ui", scene);

        // Full-screen dark overlay
        this._root = new Rectangle("scoreboard_root");
        this._root.width = 1;
        this._root.height = 1;
        this._root.thickness = 0;
        this._root.background = "rgba(0,0,0,0.7)";
        this._root.isVisible = false;
        this._texture.addControl(this._root);

        // Content container (centered, fixed width)
        const content = new StackPanel("scoreboard_content");
        content.isVertical = true;
        content.widthInPixels = 500;
        content.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._root.addControl(content);

        // Title
        this._titleText = new TextBlock("scoreboard_title", "SCOREBOARD");
        this._titleText.fontFamily = "Orbitron, monospace";
        this._titleText.fontSize = 36;
        this._titleText.color = "white";
        this._titleText.heightInPixels = 60;
        this._titleText.paddingBottomInPixels = 10;
        content.addControl(this._titleText);

        // Countdown subtitle (hidden by default)
        this._countdownText = new TextBlock("scoreboard_countdown", "");
        this._countdownText.fontFamily = "monospace";
        this._countdownText.fontSize = 18;
        this._countdownText.color = "rgba(255,255,255,0.7)";
        this._countdownText.heightInPixels = 30;
        this._countdownText.paddingBottomInPixels = 15;
        this._countdownText.isVisible = false;
        content.addControl(this._countdownText);

        // Header row
        const header = this._createRow("NAME", "K", "D", false, true);
        content.addControl(header);

        // Player rows container
        this._rowsPanel = new StackPanel("scoreboard_rows");
        this._rowsPanel.isVertical = true;
        content.addControl(this._rowsPanel);
    }

    /** Whether the scoreboard is currently visible. */
    public get isVisible(): boolean {
        return this._root.isVisible;
    }

    /**
     * Shows the scoreboard overlay.
     */
    public show(): void {
        this._root.isVisible = true;
    }

    /**
     * Hides the scoreboard overlay.
     */
    public hide(): void {
        this._root.isVisible = false;
    }

    /**
     * Sets the scoreboard title text (e.g., "MATCH OVER" or "SCOREBOARD").
     * @param text - The title string.
     */
    public setTitle(text: string): void {
        this._titleText.text = text;
    }

    /**
     * Shows the countdown subtitle with the given seconds remaining.
     * @param seconds - Seconds until next match.
     */
    public showCountdown(seconds: number): void {
        this._countdownText.text = `Next match in ${Math.ceil(seconds)}...`;
        this._countdownText.isVisible = true;
    }

    /**
     * Hides the countdown subtitle and resets the title to default.
     */
    public resetTitle(): void {
        this._titleText.text = "SCOREBOARD";
        this._countdownText.isVisible = false;
    }

    /**
     * Rebuilds the player list with updated data.
     * @param players - Array of scoreboard entries, will be sorted by kills descending.
     */
    public updatePlayers(players: ScoreboardEntry[]): void {
        // Clear existing rows
        const children = this._rowsPanel.children.slice();
        for (const child of children) {
            this._rowsPanel.removeControl(child);
        }

        // Sort by kills descending, then deaths ascending
        const sorted = [...players].sort((a, b) => {
            if (b.kills !== a.kills) return b.kills - a.kills;
            return a.deaths - b.deaths;
        });

        for (const entry of sorted) {
            const row = this._createRow(
                entry.displayName,
                entry.kills.toString(),
                entry.deaths.toString(),
                entry.isLocal,
                false,
            );
            this._rowsPanel.addControl(row);
        }
    }

    /**
     * Creates a single scoreboard row (header or player).
     * @param name - Player name or "NAME" header.
     * @param kills - Kill count or "K" header.
     * @param deaths - Death count or "D" header.
     * @param isLocal - Whether to highlight as local player.
     * @param isHeader - Whether this is the header row.
     * @returns The row container.
     */
    private _createRow(
        name: string,
        kills: string,
        deaths: string,
        isLocal: boolean,
        isHeader: boolean,
    ): Rectangle {
        const row = new Rectangle();
        row.heightInPixels = 32;
        row.widthInPixels = 500;
        row.thickness = 0;
        row.paddingBottomInPixels = 2;

        if (isLocal) {
            row.background = "rgba(255,255,255,0.1)";
        } else {
            row.background = "transparent";
        }

        const textColor = isHeader ? "rgba(255,255,255,0.6)" : "white";
        const fontSize = isHeader ? 14 : 16;

        const nameText = new TextBlock();
        nameText.text = name;
        nameText.fontFamily = "monospace";
        nameText.fontSize = fontSize;
        nameText.color = textColor;
        nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        nameText.paddingLeftInPixels = 20;
        nameText.widthInPixels = 340;
        nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.addControl(nameText);

        const killsText = new TextBlock();
        killsText.text = kills;
        killsText.fontFamily = "monospace";
        killsText.fontSize = fontSize;
        killsText.color = textColor;
        killsText.widthInPixels = 60;
        killsText.leftInPixels = 360;
        killsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.addControl(killsText);

        const deathsText = new TextBlock();
        deathsText.text = deaths;
        deathsText.fontFamily = "monospace";
        deathsText.fontSize = fontSize;
        deathsText.color = textColor;
        deathsText.widthInPixels = 60;
        deathsText.leftInPixels = 420;
        deathsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        row.addControl(deathsText);

        return row;
    }

    /**
     * Disposes the scoreboard UI.
     */
    public dispose(): void {
        this._texture.dispose();
    }
}
