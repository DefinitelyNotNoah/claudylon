/**
 * Main menu UI overlay with title, map selection, Host/Join/Offline buttons,
 * display name input, Create-a-Class, Options, and Quit.
 * Settings (sensitivity, volume, debug, bots, graphics) are
 * in the Options sub-menu via OptionsMenuUI.
 * @module client/ui/MainMenuUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { createFullscreenUI } from "./uiUtils";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { InputText } from "@babylonjs/gui/2D/controls/inputText";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Grid } from "@babylonjs/gui/2D/controls/grid";
import { Control } from "@babylonjs/gui/2D/controls/control";

import { CreateClassUI } from "./CreateClassUI";
import { OptionsMenuUI } from "./OptionsMenuUI";
import { MAP_REGISTRY, SELECTED_MAP_KEY, DEFAULT_MAP_ID } from "../../shared/constants/MapRegistry";
import type { MapId } from "../../shared/constants/MapRegistry";

/** Button width in pixels. */
const BUTTON_WIDTH = "300px";

/** Button height in pixels. */
const BUTTON_HEIGHT = "60px";

/** localStorage key for persisted display name. */
const DISPLAY_NAME_KEY = "fps_display_name";

/** localStorage key for last-used server IP. */
const LAST_IP_KEY = "fps_last_server_ip";

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
    btn.onPointerUpObservable.add(onClick);

    return btn;
}

/**
 * Creates a styled text input field.
 * @param name - Control name.
 * @param placeholder - Placeholder text.
 * @param initialValue - Initial value.
 * @returns Configured InputText control.
 */
function createInputField(name: string, placeholder: string, initialValue: string): InputText {
    const input = new InputText(name);
    input.width = BUTTON_WIDTH;
    input.height = "50px";
    input.color = "white";
    input.fontSize = 20;
    input.fontFamily = "Rajdhani, sans-serif";
    input.background = "rgba(255,255,255,0.05)";
    input.focusedBackground = "rgba(255,255,255,0.1)";
    input.thickness = 1;
    (input as any).cornerRadius = 4;
    input.placeholderText = placeholder;
    input.placeholderColor = "rgba(255,255,255,0.3)";
    input.text = initialValue;
    input.paddingTop = "4px";
    input.paddingBottom = "4px";
    return input;
}

/**
 * Main menu UI. Displays title, map selection, Host/Join/Offline buttons,
 * display name input, Create-a-Class, Options, and Quit.
 */
export class MainMenuUI {
    private _advancedTexture: AdvancedDynamicTexture;
    private _mainPanel: StackPanel;
    private _joinPanel: StackPanel;
    private _createClassUI: CreateClassUI;
    private _optionsMenuUI: OptionsMenuUI;
    private _nameInput: InputText;
    private _ipInput: InputText;
    private _errorText: TextBlock;

    /** Currently selected map ID. */
    private _selectedMapId: MapId;

    /** Map of map ID → its selection button (for toggling highlight). */
    private _mapButtons: Map<MapId, Button> = new Map();

    /**
     * Creates the main menu UI overlay.
     * @param scene - The Babylon.js scene.
     * @param onHostGame - Callback when Host Game is clicked. Receives display name.
     * @param onJoinGame - Callback when Connect is clicked. Receives IP and display name.
     * @param onPlayOffline - Callback when Play Offline is clicked.
     */
    constructor(
        scene: Scene,
        onHostGame: (displayName: string) => void,
        onJoinGame: (ip: string, displayName: string) => void,
        onPlayOffline: () => void,
    ) {
        this._advancedTexture = createFullscreenUI("main_menu_ui", scene);

        // Restore previously selected map or default
        this._selectedMapId = (localStorage.getItem(SELECTED_MAP_KEY) ?? DEFAULT_MAP_ID) as MapId;

        /* Semi-transparent dark overlay */
        const overlay = new Rectangle("menu_overlay");
        overlay.width = 1;
        overlay.height = 1;
        overlay.background = "rgba(0,0,0,0.4)";
        overlay.thickness = 0;
        this._advancedTexture.addControl(overlay);

        // ─── Main Panel (default view) ────────────────────────────

        this._mainPanel = new StackPanel("menu_panel");
        this._mainPanel.width = "400px";
        this._mainPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._mainPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._advancedTexture.addControl(this._mainPanel);

        /* Title */
        const title = new TextBlock("menu_title", "FPS GAME");
        title.color = "white";
        title.fontSize = 48;
        title.fontFamily = "Orbitron, sans-serif";
        title.height = "80px";
        title.paddingBottom = "10px";
        this._mainPanel.addControl(title);

        /* Subtitle */
        const subtitle = new TextBlock("menu_subtitle", "Free-For-All Arena Shooter");
        subtitle.color = "rgba(255,255,255,0.6)";
        subtitle.fontSize = 16;
        subtitle.fontFamily = "Rajdhani, sans-serif";
        subtitle.height = "30px";
        subtitle.paddingBottom = "20px";
        this._mainPanel.addControl(subtitle);

        /* Display name label */
        const nameLabel = new TextBlock("name_label", "Display Name");
        nameLabel.color = "rgba(255,255,255,0.6)";
        nameLabel.fontSize = 14;
        nameLabel.fontFamily = "Rajdhani, sans-serif";
        nameLabel.height = "25px";
        this._mainPanel.addControl(nameLabel);

        /* Display name input */
        const savedName = localStorage.getItem(DISPLAY_NAME_KEY) || "";
        this._nameInput = createInputField("name_input", "Enter your name...", savedName);
        this._nameInput.paddingBottom = "20px";
        this._nameInput.onTextChangedObservable.add((input) => {
            localStorage.setItem(DISPLAY_NAME_KEY, input.text);
        });
        this._mainPanel.addControl(this._nameInput);

        // ─── Map Selection ─────────────────────────────────────────

        /* Section label */
        const mapLabel = new TextBlock("map_label", "Select Map");
        mapLabel.color = "rgba(255,255,255,0.6)";
        mapLabel.fontSize = 14;
        mapLabel.fontFamily = "Rajdhani, sans-serif";
        mapLabel.height = "22px";
        this._mainPanel.addControl(mapLabel);

        /* Grid of map selection buttons (one per map) */
        const mapGrid = new Grid("map_grid");
        mapGrid.width = BUTTON_WIDTH;
        mapGrid.height = "50px";
        mapGrid.paddingBottom = "16px";

        const colCount = MAP_REGISTRY.length;
        for (let i = 0; i < colCount; i++) {
            mapGrid.addColumnDefinition(1 / colCount);
        }
        mapGrid.addRowDefinition(1);

        MAP_REGISTRY.forEach((mapInfo, colIdx) => {
            const isSelected = mapInfo.id === this._selectedMapId;
            const btn = Button.CreateSimpleButton(`btn_map_${mapInfo.id}`, mapInfo.displayName.toUpperCase());
            btn.color = "white";
            btn.fontSize = 14;
            btn.fontFamily = "Rajdhani, sans-serif";
            btn.background = isSelected ? "rgba(100,200,255,0.25)" : "rgba(255,255,255,0.07)";
            btn.thickness = isSelected ? 2 : 1;
            btn.cornerRadius = 4;
            btn.paddingLeft = colIdx === 0 ? "0px" : "4px";
            btn.paddingRight = colIdx === colCount - 1 ? "0px" : "4px";

            btn.onPointerEnterObservable.add(() => {
                if (mapInfo.id !== this._selectedMapId) {
                    btn.background = "rgba(255,255,255,0.15)";
                }
            });
            btn.onPointerOutObservable.add(() => {
                if (mapInfo.id !== this._selectedMapId) {
                    btn.background = "rgba(255,255,255,0.07)";
                }
            });
            btn.onPointerUpObservable.add(() => {
                this._selectMap(mapInfo.id);
            });

            this._mapButtons.set(mapInfo.id, btn);
            mapGrid.addControl(btn, 0, colIdx);
        });

        this._mainPanel.addControl(mapGrid);

        /* Map description text (shows the description of the selected map) */
        const mapDesc = this._getSelectedMapInfo()?.description ?? "";
        const mapDescText = new TextBlock("map_desc", mapDesc);
        mapDescText.color = "rgba(255,255,255,0.45)";
        mapDescText.fontSize = 12;
        mapDescText.fontFamily = "Rajdhani, sans-serif";
        mapDescText.height = "20px";
        mapDescText.paddingBottom = "14px";
        this._mainPanel.addControl(mapDescText);

        // Store reference so _selectMap() can update it
        (this as any)._mapDescText = mapDescText;

        /* Error text (hidden by default) */
        this._errorText = new TextBlock("error_text", "");
        this._errorText.color = "rgba(255,100,100,0.9)";
        this._errorText.fontSize = 14;
        this._errorText.fontFamily = "Rajdhani, sans-serif";
        this._errorText.height = "25px";
        this._errorText.isVisible = false;
        this._mainPanel.addControl(this._errorText);

        /* Host Game button */
        this._mainPanel.addControl(createMenuButton("btn_host", "HOST GAME", () => {
            const name = this._getDisplayName();
            onHostGame(name);
        }));

        this._addSpacer(this._mainPanel, "spacer_1", "10px");

        /* Join Game button */
        this._mainPanel.addControl(createMenuButton("btn_join", "JOIN GAME", () => {
            this._showJoinPanel();
        }));

        this._addSpacer(this._mainPanel, "spacer_2", "10px");

        /* Play Offline button */
        this._mainPanel.addControl(createMenuButton("btn_offline", "PLAY OFFLINE", onPlayOffline));

        this._addSpacer(this._mainPanel, "spacer_cac", "10px");

        /* Create a Class button */
        this._mainPanel.addControl(createMenuButton("btn_create_class", "CREATE A CLASS", () => {
            this._showCreateClass();
        }));

        this._addSpacer(this._mainPanel, "spacer_3", "10px");

        /* Options button */
        this._mainPanel.addControl(createMenuButton("btn_options", "OPTIONS", () => {
            this._showOptions();
        }));

        this._addSpacer(this._mainPanel, "spacer_4", "15px");

        /* Quit Game button */
        this._mainPanel.addControl(createMenuButton("btn_quit", "QUIT GAME", () => {
            window.close();
        }));

        // ─── Join Panel (IP entry dialog) ─────────────────────────

        this._joinPanel = new StackPanel("join_panel");
        this._joinPanel.width = "400px";
        this._joinPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._joinPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._joinPanel.isVisible = false;
        this._advancedTexture.addControl(this._joinPanel);

        /* Join title */
        const joinTitle = new TextBlock("join_title", "JOIN GAME");
        joinTitle.color = "white";
        joinTitle.fontSize = 36;
        joinTitle.fontFamily = "Orbitron, sans-serif";
        joinTitle.height = "60px";
        joinTitle.paddingBottom = "20px";
        this._joinPanel.addControl(joinTitle);

        /* IP label */
        const ipLabel = new TextBlock("ip_label", "Host IP Address");
        ipLabel.color = "rgba(255,255,255,0.6)";
        ipLabel.fontSize = 14;
        ipLabel.fontFamily = "Rajdhani, sans-serif";
        ipLabel.height = "25px";
        this._joinPanel.addControl(ipLabel);

        /* IP input */
        const savedIp = localStorage.getItem(LAST_IP_KEY) || "localhost";
        this._ipInput = createInputField("ip_input", "e.g. 26.0.0.1 or localhost", savedIp);
        this._ipInput.paddingBottom = "20px";
        this._joinPanel.addControl(this._ipInput);

        /* Connect button */
        this._joinPanel.addControl(createMenuButton("btn_connect", "CONNECT", () => {
            const ip = this._ipInput.text.trim() || "localhost";
            localStorage.setItem(LAST_IP_KEY, ip);
            const name = this._getDisplayName();
            onJoinGame(ip, name);
        }));

        this._addSpacer(this._joinPanel, "join_spacer", "10px");

        /* Back button */
        this._joinPanel.addControl(createMenuButton("btn_back", "BACK", () => {
            this._showMainPanel();
        }));

        // ─── Create-a-Class Panel ─────────────────────────────────
        this._createClassUI = new CreateClassUI(this._advancedTexture, () => {
            this._showMainPanel();
        });

        // ─── Options Panel ────────────────────────────────────────
        this._optionsMenuUI = new OptionsMenuUI(
            this._advancedTexture,
            () => this._showMainPanel(),
            { showBotSettings: true },
        );
    }

    /**
     * Selects a map, updates button highlights, and persists the choice.
     * @param mapId - The map to select.
     */
    private _selectMap(mapId: MapId): void {
        const previous = this._selectedMapId;
        this._selectedMapId = mapId;
        localStorage.setItem(SELECTED_MAP_KEY, mapId);

        // Update previous button to unselected style
        const prevBtn = this._mapButtons.get(previous);
        if (prevBtn) {
            prevBtn.background = "rgba(255,255,255,0.07)";
            prevBtn.thickness = 1;
        }

        // Update new button to selected style
        const nextBtn = this._mapButtons.get(mapId);
        if (nextBtn) {
            nextBtn.background = "rgba(100,200,255,0.25)";
            nextBtn.thickness = 2;
        }

        // Update description text
        const descText = (this as any)._mapDescText as TextBlock | undefined;
        if (descText) {
            descText.text = this._getSelectedMapInfo()?.description ?? "";
        }
    }

    /**
     * Returns the MapInfo entry for the currently selected map.
     * @returns MapInfo or undefined.
     */
    private _getSelectedMapInfo() {
        return MAP_REGISTRY.find(m => m.id === this._selectedMapId);
    }

    /**
     * Shows a connection error message on the main panel.
     * @param message - Error message to display.
     */
    public showError(message: string): void {
        this._errorText.text = message;
        this._errorText.isVisible = true;
        this._showMainPanel();
    }

    /**
     * Hides any displayed error message.
     */
    public clearError(): void {
        this._errorText.isVisible = false;
    }

    /**
     * Gets the current display name, falling back to a default.
     * @returns The display name.
     */
    private _getDisplayName(): string {
        const name = this._nameInput.text.trim();
        return name || "Player";
    }

    /** Shows the main menu panel and hides all sub-panels. */
    private _showMainPanel(): void {
        this._mainPanel.isVisible = true;
        this._joinPanel.isVisible = false;
        this._createClassUI.hide();
        this._optionsMenuUI.hide();
    }

    /** Shows the join IP panel and hides the main panel. */
    private _showJoinPanel(): void {
        this._mainPanel.isVisible = false;
        this._joinPanel.isVisible = true;
        this._createClassUI.hide();
        this._optionsMenuUI.hide();
    }

    /** Shows the create-a-class panel and hides the main/join panels. */
    private _showCreateClass(): void {
        this._mainPanel.isVisible = false;
        this._joinPanel.isVisible = false;
        this._optionsMenuUI.hide();
        this._createClassUI.show();
    }

    /** Shows the options menu and hides the main panel. */
    private _showOptions(): void {
        this._mainPanel.isVisible = false;
        this._joinPanel.isVisible = false;
        this._createClassUI.hide();
        this._optionsMenuUI.show();
    }

    /**
     * Adds a transparent spacer to a panel.
     * @param panel - The panel to add the spacer to.
     * @param name - Control name.
     * @param height - Spacer height.
     */
    private _addSpacer(panel: StackPanel, name: string, height: string): void {
        const spacer = new Rectangle(name);
        spacer.height = height;
        spacer.thickness = 0;
        spacer.background = "transparent";
        panel.addControl(spacer);
    }

    /**
     * Disposes the GUI texture and all controls.
     */
    public dispose(): void {
        this._advancedTexture.dispose();
    }
}
