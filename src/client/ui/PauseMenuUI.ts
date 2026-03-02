/**
 * Pause menu UI overlay with Resume, Options, Main Menu, and Quit buttons.
 * Settings are accessed via the Options sub-menu (OptionsMenuUI).
 * Toggled by P key during gameplay.
 * @module client/ui/PauseMenuUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { OptionsMenuUI } from "./OptionsMenuUI";

/** Button width in pixels. */
const BUTTON_WIDTH = "300px";

/** Button height in pixels. */
const BUTTON_HEIGHT = "60px";

/**
 * Creates a styled menu button.
 * @param name - Control name.
 * @param label - Button text.
 * @param onClick - Click handler.
 * @returns Configured Button control.
 */
function createMenuButton(name: string, label: string, onClick: () => void): Button {
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
    btn.onPointerDownObservable.add(onClick);

    return btn;
}

/**
 * Pause menu overlay. Starts hidden; call show()/hide() to toggle.
 */
export class PauseMenuUI {
    private _advancedTexture: AdvancedDynamicTexture;
    private _root: Rectangle;
    private _pausePanel: StackPanel;
    private _optionsMenuUI: OptionsMenuUI;

    /** Called when the debug toggle is clicked. Receives the new enabled state. */
    public onDebugToggle: ((enabled: boolean) => void) | null = null;

    /** Called when the master volume slider changes. Receives the new volume (0–1). */
    public onVolumeChange: ((volume: number) => void) | null = null;

    /** Called when the ragdoll toggle changes. Receives the new enabled state. */
    public onRagdollToggle: ((enabled: boolean) => void) | null = null;

    /**
     * Creates the pause menu UI.
     * @param scene - The Babylon.js scene.
     * @param onResume - Callback invoked when Resume is clicked.
     * @param onMainMenu - Callback invoked when Main Menu is clicked.
     */
    constructor(scene: Scene, onResume: () => void, onMainMenu: () => void) {
        this._advancedTexture = createFullscreenUI("pause_menu_ui", scene);

        /* Root container — toggled for show/hide */
        this._root = new Rectangle("pause_root");
        this._root.width = 1;
        this._root.height = 1;
        this._root.background = "rgba(0,0,0,0.5)";
        this._root.thickness = 0;
        this._root.isVisible = false;
        this._advancedTexture.addControl(this._root);

        /* Centered content panel */
        this._pausePanel = new StackPanel("pause_panel");
        this._pausePanel.width = "400px";
        this._pausePanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._pausePanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._root.addControl(this._pausePanel);

        /* Title */
        const title = new TextBlock("pause_title", "PAUSED");
        title.color = "white";
        title.fontSize = 40;
        title.fontFamily = "Orbitron, sans-serif";
        title.height = "70px";
        title.paddingBottom = "30px";
        this._pausePanel.addControl(title);

        /* Resume button */
        this._pausePanel.addControl(createMenuButton("btn_resume", "RESUME", onResume));

        /* Spacer */
        this._addSpacer("spacer_1", "15px");

        /* Options button */
        this._pausePanel.addControl(createMenuButton("btn_options", "OPTIONS", () => {
            this._showOptions();
        }));

        /* Spacer */
        this._addSpacer("spacer_2", "15px");

        /* Main Menu button */
        this._pausePanel.addControl(createMenuButton("btn_main_menu", "MAIN MENU", onMainMenu));

        /* Spacer */
        this._addSpacer("spacer_3", "15px");

        /* Quit Game button */
        this._pausePanel.addControl(createMenuButton("btn_quit", "QUIT GAME", () => {
            window.close();
        }));

        // ─── Options Sub-Menu ─────────────────────────────────────
        this._optionsMenuUI = new OptionsMenuUI(
            this._advancedTexture,
            () => this._hideOptions(),
            {
                onDebugToggle: (enabled: boolean) => {
                    this.onDebugToggle?.(enabled);
                },
                onVolumeChange: (volume: number) => {
                    this.onVolumeChange?.(volume);
                },
                onRagdollToggle: (enabled: boolean) => {
                    this.onRagdollToggle?.(enabled);
                },
                showBotSettings: false,
            },
        );
    }

    /** Whether the pause menu is currently visible. */
    public get isVisible(): boolean {
        return this._root.isVisible;
    }

    /**
     * Shows the pause menu overlay.
     */
    public show(): void {
        this._root.isVisible = true;
        this._pausePanel.isVisible = true;
        this._optionsMenuUI.hide();
    }

    /**
     * Hides the pause menu overlay.
     */
    public hide(): void {
        this._root.isVisible = false;
        this._optionsMenuUI.hide();
    }

    /**
     * Shows the options sub-menu and hides the pause buttons.
     */
    private _showOptions(): void {
        this._pausePanel.isVisible = false;
        this._optionsMenuUI.show();
    }

    /**
     * Hides the options sub-menu and shows the pause buttons.
     */
    private _hideOptions(): void {
        this._optionsMenuUI.hide();
        this._pausePanel.isVisible = true;
    }

    /**
     * Adds a spacer to the pause panel.
     * @param name - Control name.
     * @param height - Spacer height.
     */
    private _addSpacer(name: string, height: string): void {
        const spacer = new Rectangle(name);
        spacer.height = height;
        spacer.thickness = 0;
        spacer.background = "transparent";
        this._pausePanel.addControl(spacer);
    }

    /**
     * Disposes the GUI texture and all controls.
     */
    public dispose(): void {
        this._advancedTexture.dispose();
    }
}
