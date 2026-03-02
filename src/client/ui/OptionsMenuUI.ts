/**
 * Options menu UI with tabbed categories: Game and Graphics.
 * Game tab: mouse sensitivity, master volume, debug toggle, bot settings.
 * Graphics tab: all rendering pipeline settings from GraphicsSettings.
 * Shared between MainMenuUI and PauseMenuUI.
 * @module client/ui/OptionsMenuUI
 */

import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { Slider } from "@babylonjs/gui/2D/controls/sliders/slider";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";

import {
    GraphicsSettings,
    GRAPHICS_SETTINGS_DESCRIPTORS,
} from "./GraphicsSettings";
import type { GraphicsSettingDescriptor } from "./GraphicsSettings";
import {
    DEFAULT_MOUSE_SENSITIVITY,
    MIN_MOUSE_SENSITIVITY,
    MAX_MOUSE_SENSITIVITY,
    SENSITIVITY_STORAGE_KEY,
    DEFAULT_MASTER_VOLUME,
    MASTER_VOLUME_KEY,
} from "../../shared/constants";
import {
    BOT_COUNT_KEY,
    BOT_DIFFICULTY_KEY,
    DEFAULT_BOT_COUNT,
    DEFAULT_BOT_DIFFICULTY,
    RAGDOLL_ENABLED_KEY,
    DEFAULT_RAGDOLL_ENABLED,
} from "../../shared/constants/BotConstants";
import {
    CHARACTER_MODELS,
    BOT_CHARACTER_KEY,
    DEFAULT_BOT_CHARACTER,
} from "../../shared/constants/CharacterConstants";
import { DEBUG_MODE_KEY } from "./DebugOverlayUI";

/** Button width for options menu controls. */
const OPT_WIDTH = "320px";

/** Slider width. */
const SLIDER_WIDTH = "280px";

/**
 * Options for configuring the OptionsMenuUI behavior.
 */
export interface OptionsMenuCallbacks {
    /** Called when the debug toggle changes (in-match only). */
    onDebugToggle?: (enabled: boolean) => void;
    /** Called when master volume changes (in-match only). */
    onVolumeChange?: (volume: number) => void;
    /** Called when the ragdoll toggle changes (live mid-game). */
    onRagdollToggle?: (enabled: boolean) => void;
    /** Whether to show bot settings (main menu only). */
    showBotSettings?: boolean;
}

/**
 * Creates a styled tab button.
 * @param name - Control name.
 * @param label - Button text.
 * @param isActive - Whether this tab is initially active.
 * @param onClick - Click handler.
 * @returns Configured Button control.
 */
function createTabButton(name: string, label: string, isActive: boolean, onClick: () => void): Button {
    const btn = Button.CreateSimpleButton(name, label);
    btn.width = "150px";
    btn.height = "40px";
    btn.color = "white";
    btn.fontSize = 18;
    btn.fontFamily = "Rajdhani, sans-serif";
    btn.background = isActive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.05)";
    btn.cornerRadius = 4;
    btn.thickness = isActive ? 2 : 1;
    btn.onPointerUpObservable.add(onClick);
    return btn;
}

/**
 * Full-featured options menu with Game and Graphics tabs.
 * Rendered as an overlay on an AdvancedDynamicTexture.
 * Graphics tab is built lazily on first open to avoid perf cost.
 */
export class OptionsMenuUI {
    private _root: Rectangle;
    private _gamePanel: StackPanel;
    private _graphicsPanel: StackPanel;
    private _graphicsBuilt: boolean = false;
    private _container: StackPanel;
    private _gameTabBtn: Button;
    private _graphicsTabBtn: Button;
    private _callbacks: OptionsMenuCallbacks;

    /**
     * Creates the options menu.
     * @param advancedTexture - The parent ADT to add controls to.
     * @param onBack - Callback when Back is clicked.
     * @param callbacks - Optional callbacks for debug/volume changes.
     */
    constructor(
        advancedTexture: AdvancedDynamicTexture,
        onBack: () => void,
        callbacks: OptionsMenuCallbacks = {},
    ) {
        this._callbacks = callbacks;

        /* Root container — toggled for show/hide */
        this._root = new Rectangle("options_root");
        this._root.width = 1;
        this._root.height = 1;
        this._root.background = "rgba(0,0,0,0.6)";
        this._root.thickness = 0;
        this._root.isVisible = false;
        advancedTexture.addControl(this._root);

        /* Main container */
        this._container = new StackPanel("options_container");
        this._container.width = "420px";
        this._container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this._container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._root.addControl(this._container);

        /* Title */
        const title = new TextBlock("options_title", "OPTIONS");
        title.color = "white";
        title.fontSize = 36;
        title.fontFamily = "Orbitron, sans-serif";
        title.height = "60px";
        title.paddingBottom = "10px";
        this._container.addControl(title);

        /* Tab row */
        const tabRow = new StackPanel("tab_row");
        tabRow.isVertical = false;
        tabRow.height = "50px";
        tabRow.width = OPT_WIDTH;
        tabRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this._container.addControl(tabRow);

        this._gameTabBtn = createTabButton("tab_game", "GAME", true, () => this._showTab("game"));
        this._graphicsTabBtn = createTabButton("tab_graphics", "GRAPHICS", false, () => this._showTab("graphics"));
        tabRow.addControl(this._gameTabBtn);

        const tabSpacer = new Rectangle("tab_spacer");
        tabSpacer.width = "20px";
        tabSpacer.height = "40px";
        tabSpacer.thickness = 0;
        tabSpacer.background = "transparent";
        tabRow.addControl(tabSpacer);

        tabRow.addControl(this._graphicsTabBtn);

        /* Separator */
        const sep = new Rectangle("separator");
        sep.height = "2px";
        sep.width = OPT_WIDTH;
        sep.background = "rgba(255,255,255,0.2)";
        sep.thickness = 0;
        sep.paddingTop = "5px";
        sep.paddingBottom = "5px";
        this._container.addControl(sep);

        /* Game panel */
        this._gamePanel = new StackPanel("game_panel");
        this._gamePanel.width = "380px";
        this._gamePanel.paddingTop = "10px";
        this._container.addControl(this._gamePanel);
        this._buildGameTab();

        /* Graphics panel (plain StackPanel, built lazily) */
        this._graphicsPanel = new StackPanel("graphics_panel");
        this._graphicsPanel.width = "380px";
        this._graphicsPanel.paddingTop = "10px";
        this._graphicsPanel.isVisible = false;
        this._container.addControl(this._graphicsPanel);

        /* Bottom spacer */
        const bottomSpacer = new Rectangle("opt_bottom_spacer");
        bottomSpacer.height = "15px";
        bottomSpacer.thickness = 0;
        bottomSpacer.background = "transparent";
        this._container.addControl(bottomSpacer);

        /* Back button */
        const backBtn = Button.CreateSimpleButton("btn_options_back", "BACK");
        backBtn.width = OPT_WIDTH;
        backBtn.height = "50px";
        backBtn.color = "white";
        backBtn.fontSize = 22;
        backBtn.fontFamily = "Rajdhani, sans-serif";
        backBtn.background = "rgba(255,255,255,0.1)";
        backBtn.cornerRadius = 4;
        backBtn.thickness = 1;
        backBtn.onPointerEnterObservable.add(() => { backBtn.background = "rgba(255,255,255,0.2)"; });
        backBtn.onPointerOutObservable.add(() => { backBtn.background = "rgba(255,255,255,0.1)"; });
        backBtn.onPointerUpObservable.add(onBack);
        this._container.addControl(backBtn);
    }

    /**
     * Builds the Game tab controls: sensitivity, volume, debug, bots.
     */
    private _buildGameTab(): void {
        const panel = this._gamePanel;

        // ─── Mouse Sensitivity ───────────────────────────────
        this._addLabel(panel, "Mouse Sensitivity");
        const storedSens = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
        const currentSens = storedSens ? parseFloat(storedSens) : DEFAULT_MOUSE_SENSITIVITY;

        const sensValueLabel = this._addValueLabel(panel, currentSens.toFixed(4));
        const sensSlider = this._createSlider(
            "opt_sens_slider",
            MIN_MOUSE_SENSITIVITY,
            MAX_MOUSE_SENSITIVITY,
            currentSens,
        );
        sensSlider.onValueChangedObservable.add((value) => {
            localStorage.setItem(SENSITIVITY_STORAGE_KEY, value.toString());
            sensValueLabel.text = value.toFixed(4);
        });
        panel.addControl(sensSlider);
        this._addSpacer(panel, "sens_spacer");

        // ─── Master Volume ───────────────────────────────────
        this._addLabel(panel, "Master Volume");
        const storedVol = localStorage.getItem(MASTER_VOLUME_KEY);
        const currentVol = storedVol ? parseFloat(storedVol) : DEFAULT_MASTER_VOLUME;

        const volValueLabel = this._addValueLabel(panel, Math.round(currentVol * 100) + "%");
        const volSlider = this._createSlider("opt_vol_slider", 0, 1, currentVol);
        volSlider.onValueChangedObservable.add((value) => {
            localStorage.setItem(MASTER_VOLUME_KEY, value.toString());
            volValueLabel.text = Math.round(value * 100) + "%";
            this._callbacks.onVolumeChange?.(value);
        });
        panel.addControl(volSlider);
        this._addSpacer(panel, "vol_spacer");

        // ─── Debug Toggle ────────────────────────────────────
        const debugEnabled = localStorage.getItem(DEBUG_MODE_KEY) === "true";
        const debugBtn = Button.CreateSimpleButton(
            "opt_btn_debug",
            debugEnabled ? "DEBUG: ON" : "DEBUG: OFF",
        );
        debugBtn.width = OPT_WIDTH;
        debugBtn.height = "40px";
        debugBtn.color = "white";
        debugBtn.fontSize = 18;
        debugBtn.fontFamily = "Rajdhani, sans-serif";
        debugBtn.background = debugEnabled ? "rgba(100,255,100,0.15)" : "rgba(255,255,255,0.05)";
        debugBtn.cornerRadius = 4;
        debugBtn.thickness = 1;
        debugBtn.onPointerUpObservable.add(() => {
            const current = localStorage.getItem(DEBUG_MODE_KEY) === "true";
            const next = !current;
            localStorage.setItem(DEBUG_MODE_KEY, String(next));
            if (debugBtn.textBlock) {
                debugBtn.textBlock.text = next ? "DEBUG: ON" : "DEBUG: OFF";
            }
            debugBtn.background = next ? "rgba(100,255,100,0.15)" : "rgba(255,255,255,0.05)";
            this._callbacks.onDebugToggle?.(next);
        });
        panel.addControl(debugBtn);
        this._addSpacer(panel, "debug_spacer");

        // ─── Bot Settings (main menu only) ───────────────────
        if (this._callbacks.showBotSettings) {
            this._addLabel(panel, "Bot Count (Offline)");
            const savedBotCount = parseInt(localStorage.getItem(BOT_COUNT_KEY) ?? "", 10);
            const currentBotCount = isNaN(savedBotCount) ? DEFAULT_BOT_COUNT : savedBotCount;

            const botCountValue = this._addValueLabel(panel, String(currentBotCount));
            const botCountSlider = this._createSlider("opt_bot_count", 1, 8, currentBotCount, 1);
            botCountSlider.onValueChangedObservable.add((value) => {
                const intVal = Math.round(value);
                localStorage.setItem(BOT_COUNT_KEY, String(intVal));
                botCountValue.text = String(intVal);
            });
            panel.addControl(botCountSlider);
            this._addSpacer(panel, "bot_count_spacer");

            this._addLabel(panel, "Bot Difficulty (Offline)");
            const savedDiff = localStorage.getItem(BOT_DIFFICULTY_KEY) ?? DEFAULT_BOT_DIFFICULTY;
            const diffOptions = ["easy", "medium", "hard"];
            const diffLabels = ["EASY", "MEDIUM", "HARD"];

            const diffRow = new StackPanel("opt_diff_row");
            diffRow.isVertical = false;
            diffRow.height = "45px";
            diffRow.width = OPT_WIDTH;
            panel.addControl(diffRow);

            const diffBtns: Button[] = [];
            const updateDiffButtons = (active: string) => {
                for (let d = 0; d < diffBtns.length; d++) {
                    const isActive = diffOptions[d] === active;
                    diffBtns[d].background = isActive ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.05)";
                    diffBtns[d].thickness = isActive ? 2 : 1;
                }
            };

            for (let d = 0; d < diffOptions.length; d++) {
                const diffBtn = Button.CreateSimpleButton(`opt_btn_diff_${diffOptions[d]}`, diffLabels[d]);
                diffBtn.width = "100px";
                diffBtn.height = "36px";
                diffBtn.color = "white";
                diffBtn.fontSize = 15;
                diffBtn.fontFamily = "Rajdhani, sans-serif";
                diffBtn.background = diffOptions[d] === savedDiff ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.05)";
                diffBtn.cornerRadius = 4;
                diffBtn.thickness = diffOptions[d] === savedDiff ? 2 : 1;
                diffBtn.onPointerUpObservable.add(() => {
                    localStorage.setItem(BOT_DIFFICULTY_KEY, diffOptions[d]);
                    updateDiffButtons(diffOptions[d]);
                });
                diffBtns.push(diffBtn);
                diffRow.addControl(diffBtn);
            }

            this._addSpacer(panel, "bot_diff_spacer");

            // ─── Bot Character Model ────────────────────────────────
            this._addLabel(panel, "Bot Character (Offline)");
            const savedBotChar = localStorage.getItem(BOT_CHARACTER_KEY) ?? DEFAULT_BOT_CHARACTER;

            const charRow = new StackPanel("opt_botchar_row");
            charRow.isVertical = false;
            charRow.height = "45px";
            charRow.width = OPT_WIDTH;
            panel.addControl(charRow);

            // Build options: "Random" + each character model
            const charOptions = ["random", ...CHARACTER_MODELS.map((m) => m.id)];
            const charLabels = ["RANDOM", ...CHARACTER_MODELS.map((m) => m.name.toUpperCase())];

            const charBtns: Button[] = [];
            const updateCharButtons = (active: string) => {
                for (let c = 0; c < charBtns.length; c++) {
                    const isActive = charOptions[c] === active;
                    charBtns[c].background = isActive ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.05)";
                    charBtns[c].thickness = isActive ? 2 : 1;
                }
            };

            for (let c = 0; c < charOptions.length; c++) {
                const charBtn = Button.CreateSimpleButton(`opt_btn_char_${charOptions[c]}`, charLabels[c]);
                charBtn.width = `${Math.floor(320 / charOptions.length)}px`;
                charBtn.height = "36px";
                charBtn.color = "white";
                charBtn.fontSize = 13;
                charBtn.fontFamily = "Rajdhani, sans-serif";
                charBtn.background = charOptions[c] === savedBotChar ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.05)";
                charBtn.cornerRadius = 4;
                charBtn.thickness = charOptions[c] === savedBotChar ? 2 : 1;
                charBtn.onPointerUpObservable.add(() => {
                    localStorage.setItem(BOT_CHARACTER_KEY, charOptions[c]);
                    updateCharButtons(charOptions[c]);
                });
                charBtns.push(charBtn);
                charRow.addControl(charBtn);
            }

        }
    }

    /**
     * Builds the Graphics tab controls from GraphicsSettings descriptors.
     * Called lazily on first tab switch to avoid startup perf cost.
     */
    private _buildGraphicsTab(): void {
        if (this._graphicsBuilt) return;
        this._graphicsBuilt = true;

        const panel = this._graphicsPanel;
        const gfx = GraphicsSettings.getInstance();

        // Group settings by category
        const categories: Record<string, { label: string; descriptors: GraphicsSettingDescriptor[] }> = {
            rendering: { label: "Rendering", descriptors: [] },
            antialiasing: { label: "Anti-Aliasing", descriptors: [] },
            bloom: { label: "Bloom", descriptors: [] },
            imageProcessing: { label: "Image Processing", descriptors: [] },
            effects: { label: "Effects", descriptors: [] },
        };

        for (const desc of GRAPHICS_SETTINGS_DESCRIPTORS) {
            categories[desc.category].descriptors.push(desc);
        }

        for (const catKey of Object.keys(categories)) {
            const cat = categories[catKey];
            if (cat.descriptors.length === 0) continue;

            // Category header
            const header = new TextBlock(`gfx_header_${catKey}`, cat.label.toUpperCase());
            header.color = "rgba(255,255,255,0.8)";
            header.fontSize = 16;
            header.fontFamily = "Orbitron, sans-serif";
            header.height = "30px";
            header.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            header.paddingLeft = "5px";
            panel.addControl(header);

            // Separator line
            const catSep = new Rectangle(`gfx_sep_${catKey}`);
            catSep.height = "1px";
            catSep.width = "340px";
            catSep.background = "rgba(255,255,255,0.15)";
            catSep.thickness = 0;
            panel.addControl(catSep);

            this._addSmallSpacer(panel, `gfx_cat_spacer_${catKey}`);

            for (const desc of cat.descriptors) {
                if (desc.type === "boolean") {
                    this._addBooleanSetting(panel, desc, gfx);
                } else {
                    this._addNumberSetting(panel, desc, gfx);
                }
                this._addSmallSpacer(panel, `gfx_spacer_${desc.key}`);
            }
        }

        // ─── Ragdoll Toggle ────────────────────────────────────
        this._addSpacer(panel, "ragdoll_spacer");
        const ragdollHeader = new TextBlock("gfx_header_ragdoll", "PHYSICS");
        ragdollHeader.color = "rgba(255,255,255,0.8)";
        ragdollHeader.fontSize = 16;
        ragdollHeader.fontFamily = "Orbitron, sans-serif";
        ragdollHeader.height = "30px";
        ragdollHeader.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        ragdollHeader.paddingLeft = "5px";
        panel.addControl(ragdollHeader);

        const ragdollSep = new Rectangle("gfx_sep_ragdoll");
        ragdollSep.height = "1px";
        ragdollSep.width = "340px";
        ragdollSep.background = "rgba(255,255,255,0.15)";
        ragdollSep.thickness = 0;
        panel.addControl(ragdollSep);
        this._addSmallSpacer(panel, "ragdoll_cat_spacer");

        const ragdollOn = localStorage.getItem(RAGDOLL_ENABLED_KEY) !== "false";
        const ragdollRow = new StackPanel("gfx_row_ragdoll");
        ragdollRow.isVertical = false;
        ragdollRow.height = "32px";
        ragdollRow.width = "340px";
        panel.addControl(ragdollRow);

        const ragdollLabel = new TextBlock("gfx_label_ragdoll", "Ragdoll");
        ragdollLabel.color = "rgba(255,255,255,0.7)";
        ragdollLabel.fontSize = 14;
        ragdollLabel.fontFamily = "Rajdhani, sans-serif";
        ragdollLabel.width = "200px";
        ragdollLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        ragdollLabel.paddingLeft = "10px";
        ragdollRow.addControl(ragdollLabel);

        const ragdollBtn = Button.CreateSimpleButton("gfx_btn_ragdoll", ragdollOn ? "ON" : "OFF");
        ragdollBtn.width = "140px";
        ragdollBtn.height = "28px";
        ragdollBtn.color = "white";
        ragdollBtn.fontSize = 14;
        ragdollBtn.fontFamily = "Rajdhani, sans-serif";
        ragdollBtn.background = ragdollOn ? "rgba(100,255,100,0.2)" : "rgba(255,255,255,0.08)";
        ragdollBtn.cornerRadius = 4;
        ragdollBtn.thickness = 1;
        ragdollBtn.onPointerUpObservable.add(() => {
            const current = localStorage.getItem(RAGDOLL_ENABLED_KEY) !== "false";
            const next = !current;
            localStorage.setItem(RAGDOLL_ENABLED_KEY, String(next));
            if (ragdollBtn.textBlock) {
                ragdollBtn.textBlock.text = next ? "ON" : "OFF";
            }
            ragdollBtn.background = next ? "rgba(100,255,100,0.2)" : "rgba(255,255,255,0.08)";
            this._callbacks.onRagdollToggle?.(next);
        });
        ragdollRow.addControl(ragdollBtn);

        // Reset to defaults button
        this._addSpacer(panel, "gfx_reset_spacer");
        const resetBtn = Button.CreateSimpleButton("btn_gfx_reset", "RESET TO DEFAULTS");
        resetBtn.width = OPT_WIDTH;
        resetBtn.height = "40px";
        resetBtn.color = "rgba(255,180,180,1)";
        resetBtn.fontSize = 16;
        resetBtn.fontFamily = "Rajdhani, sans-serif";
        resetBtn.background = "rgba(255,100,100,0.1)";
        resetBtn.cornerRadius = 4;
        resetBtn.thickness = 1;
        resetBtn.onPointerEnterObservable.add(() => { resetBtn.background = "rgba(255,100,100,0.2)"; });
        resetBtn.onPointerOutObservable.add(() => { resetBtn.background = "rgba(255,100,100,0.1)"; });
        resetBtn.onPointerUpObservable.add(() => {
            gfx.resetToDefaults();
            // Rebuild the graphics tab to reflect new default values
            this._graphicsPanel.getDescendants().forEach((c) => c.dispose());
            this._graphicsPanel.clearControls();
            this._graphicsBuilt = false;
            this._buildGraphicsTab();
        });
        panel.addControl(resetBtn);
    }

    /**
     * Adds a boolean toggle setting row.
     * @param panel - Parent panel.
     * @param desc - Setting descriptor.
     * @param gfx - GraphicsSettings instance.
     */
    private _addBooleanSetting(panel: StackPanel, desc: GraphicsSettingDescriptor, gfx: GraphicsSettings): void {
        const row = new StackPanel(`gfx_row_${desc.key}`);
        row.isVertical = false;
        row.height = "32px";
        row.width = "340px";
        panel.addControl(row);

        const label = new TextBlock(`gfx_label_${desc.key}`, desc.label);
        label.color = "rgba(255,255,255,0.7)";
        label.fontSize = 14;
        label.fontFamily = "Rajdhani, sans-serif";
        label.width = "200px";
        label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.paddingLeft = "10px";
        row.addControl(label);

        const currentVal = gfx.get(desc.key) as boolean;
        const toggleBtn = Button.CreateSimpleButton(`gfx_toggle_${desc.key}`, currentVal ? "ON" : "OFF");
        toggleBtn.width = "80px";
        toggleBtn.height = "28px";
        toggleBtn.color = "white";
        toggleBtn.fontSize = 14;
        toggleBtn.fontFamily = "Rajdhani, sans-serif";
        toggleBtn.background = currentVal ? "rgba(100,255,100,0.2)" : "rgba(255,100,100,0.2)";
        toggleBtn.cornerRadius = 4;
        toggleBtn.thickness = 1;
        toggleBtn.onPointerUpObservable.add(() => {
            const cur = gfx.get(desc.key) as boolean;
            const next = !cur;
            gfx.set(desc.key, next);
            if (toggleBtn.textBlock) {
                toggleBtn.textBlock.text = next ? "ON" : "OFF";
            }
            toggleBtn.background = next ? "rgba(100,255,100,0.2)" : "rgba(255,100,100,0.2)";
        });
        row.addControl(toggleBtn);
    }

    /**
     * Adds a number slider setting row.
     * @param panel - Parent panel.
     * @param desc - Setting descriptor.
     * @param gfx - GraphicsSettings instance.
     */
    private _addNumberSetting(panel: StackPanel, desc: GraphicsSettingDescriptor, gfx: GraphicsSettings): void {
        const row = new StackPanel(`gfx_row_${desc.key}`);
        row.isVertical = false;
        row.height = "32px";
        row.width = "340px";
        panel.addControl(row);

        const label = new TextBlock(`gfx_label_${desc.key}`, desc.label);
        label.color = "rgba(255,255,255,0.7)";
        label.fontSize = 14;
        label.fontFamily = "Rajdhani, sans-serif";
        label.width = "160px";
        label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.paddingLeft = "10px";
        row.addControl(label);

        const currentVal = gfx.get(desc.key) as number;
        const valueText = new TextBlock(`gfx_val_${desc.key}`, this._formatValue(currentVal, desc));
        valueText.color = "white";
        valueText.fontSize = 13;
        valueText.fontFamily = "Rajdhani, sans-serif";
        valueText.width = "50px";
        valueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        row.addControl(valueText);

        const slider = new Slider(`gfx_slider_${desc.key}`);
        slider.minimum = desc.min ?? 0;
        slider.maximum = desc.max ?? 1;
        slider.value = currentVal;
        if (desc.step !== undefined) slider.step = desc.step;
        slider.height = "24px";
        slider.width = "120px";
        slider.color = "white";
        slider.background = "rgba(255,255,255,0.1)";
        slider.thumbColor = "white";
        slider.isThumbCircle = true;
        slider.onValueChangedObservable.add((value) => {
            gfx.set(desc.key, value);
            valueText.text = this._formatValue(value, desc);
        });
        row.addControl(slider);
    }

    /**
     * Formats a numeric value for display.
     * @param value - The numeric value.
     * @param desc - The setting descriptor.
     * @returns Formatted string.
     */
    private _formatValue(value: number, desc: GraphicsSettingDescriptor): string {
        if (desc.step !== undefined && desc.step >= 1) {
            return String(Math.round(value));
        }
        if (desc.step !== undefined && desc.step >= 0.1) {
            return value.toFixed(1);
        }
        return value.toFixed(2);
    }

    /**
     * Switches between Game and Graphics tabs.
     * Lazily builds the Graphics tab on first switch.
     * @param tab - The tab to show.
     */
    private _showTab(tab: "game" | "graphics"): void {
        const isGame = tab === "game";
        this._gamePanel.isVisible = isGame;
        this._graphicsPanel.isVisible = !isGame;

        // Lazy build: only create graphics controls when first viewed
        if (!isGame && !this._graphicsBuilt) {
            this._buildGraphicsTab();
        }

        this._gameTabBtn.background = isGame ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.05)";
        this._gameTabBtn.thickness = isGame ? 2 : 1;
        this._graphicsTabBtn.background = !isGame ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.05)";
        this._graphicsTabBtn.thickness = !isGame ? 2 : 1;
    }

    /** Shows the options menu. */
    public show(): void {
        this._root.isVisible = true;
    }

    /** Hides the options menu. */
    public hide(): void {
        this._root.isVisible = false;
    }

    /** Whether the options menu is currently visible. */
    public get isVisible(): boolean {
        return this._root.isVisible;
    }

    /**
     * Adds a section label.
     * @param panel - Parent panel.
     * @param text - Label text.
     */
    private _addLabel(panel: StackPanel, text: string): void {
        const label = new TextBlock(`opt_label_${text}`, text);
        label.color = "rgba(255,255,255,0.6)";
        label.fontSize = 14;
        label.fontFamily = "Rajdhani, sans-serif";
        label.height = "22px";
        label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.paddingLeft = "20px";
        panel.addControl(label);
    }

    /**
     * Adds a value label and returns it.
     * @param panel - Parent panel.
     * @param text - Initial text.
     * @returns The TextBlock control.
     */
    private _addValueLabel(panel: StackPanel, text: string): TextBlock {
        const label = new TextBlock(`opt_val_${text}`, text);
        label.color = "white";
        label.fontSize = 14;
        label.fontFamily = "Rajdhani, sans-serif";
        label.height = "18px";
        panel.addControl(label);
        return label;
    }

    /**
     * Creates a styled slider.
     * @param name - Control name.
     * @param min - Minimum value.
     * @param max - Maximum value.
     * @param value - Initial value.
     * @param step - Step size (optional).
     * @returns Configured Slider control.
     */
    private _createSlider(name: string, min: number, max: number, value: number, step?: number): Slider {
        const slider = new Slider(name);
        slider.minimum = min;
        slider.maximum = max;
        slider.value = value;
        if (step !== undefined) slider.step = step;
        slider.height = "28px";
        slider.width = SLIDER_WIDTH;
        slider.color = "white";
        slider.background = "rgba(255,255,255,0.1)";
        slider.thumbColor = "white";
        slider.isThumbCircle = true;
        return slider;
    }

    /**
     * Adds a spacer to a panel.
     * @param panel - The panel.
     * @param name - Control name.
     */
    private _addSpacer(panel: StackPanel, name: string): void {
        const spacer = new Rectangle(name);
        spacer.height = "10px";
        spacer.thickness = 0;
        spacer.background = "transparent";
        panel.addControl(spacer);
    }

    /**
     * Adds a smaller spacer.
     * @param panel - The panel.
     * @param name - Control name.
     */
    private _addSmallSpacer(panel: StackPanel, name: string): void {
        const spacer = new Rectangle(name);
        spacer.height = "4px";
        spacer.thickness = 0;
        spacer.background = "transparent";
        panel.addControl(spacer);
    }
}
