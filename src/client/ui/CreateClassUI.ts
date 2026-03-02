/**
 * Create-a-Class weapon loadout selection panel.
 * Supports 4 preset classes and custom primary/secondary weapon selection.
 * Locked weapons (based on player level) are greyed out.
 * Persists loadout to localStorage.
 * @module client/ui/CreateClassUI
 */

import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";

import { WEAPON_STATS, WEAPON_UNLOCK_REQUIREMENTS } from "../../shared/constants/WeaponConstants";
import type { WeaponId } from "../../shared/types";
import {
    CHARACTER_MODELS,
    CHARACTER_MODEL_KEY,
    DEFAULT_CHARACTER_ID,
} from "../../shared/constants/CharacterConstants";
import { ProgressionManager } from "../progression/ProgressionManager";

/** localStorage key for primary weapon slot. */
const SLOT1_KEY = "fps_loadout_slot1";

/** localStorage key for secondary weapon slot. */
const SLOT2_KEY = "fps_loadout_slot2";

/** Default primary weapon. */
const DEFAULT_SLOT1: WeaponId = "ak47";

/** Default secondary weapon. */
const DEFAULT_SLOT2: WeaponId = "usp";

/** Primary weapon IDs (rifles + snipers). */
const PRIMARY_WEAPONS: WeaponId[] = ["ak47", "m4a1", "scar", "intervention", "50cal", "svd"];

/** Secondary weapon IDs (pistols). */
const SECONDARY_WEAPONS: WeaponId[] = ["usp", "m9", "eagle"];

/** Preset class definitions. */
const PRESET_CLASSES: { name: string; slot1: WeaponId; slot2: WeaponId }[] = [
    { name: "RIFLEMAN", slot1: "ak47", slot2: "usp" },
    { name: "SNIPER", slot1: "intervention", slot2: "usp" },
    { name: "OPERATOR", slot1: "m4a1", slot2: "m9" },
    { name: "BRAWLER", slot1: "scar", slot2: "eagle" },
];

/** Button styling constants. */
const ACTIVE_BG = "rgba(255,255,255,0.25)";
const INACTIVE_BG = "rgba(255,255,255,0.08)";
const LOCKED_BG = "rgba(255,255,255,0.03)";
const LOCKED_COLOR = "rgba(255,255,255,0.3)";

/**
 * Create-a-Class panel. Built on a provided AdvancedDynamicTexture
 * (shared with MainMenuUI). Toggled via isVisible on the root container.
 */
export class CreateClassUI {
    private _panel: Rectangle;
    private _slot1: WeaponId;
    private _slot2: WeaponId;
    private _characterId: string;
    private _currentText: TextBlock;
    private _primaryButtons: Map<WeaponId, Button> = new Map();
    private _secondaryButtons: Map<WeaponId, Button> = new Map();
    private _characterButtons: Map<string, Button> = new Map();
    private _presetButtons: Button[] = [];

    /**
     * Creates the create-a-class panel.
     * @param advancedTexture - The shared fullscreen GUI texture.
     * @param onBack - Callback when Back button is pressed.
     */
    constructor(advancedTexture: AdvancedDynamicTexture, onBack: () => void) {
        const loadout = CreateClassUI.getLoadout();
        this._slot1 = loadout.slot1;
        this._slot2 = loadout.slot2;
        this._characterId = loadout.characterId;

        // Root container (full screen, hidden by default)
        this._panel = new Rectangle("cac_panel");
        this._panel.width = 1;
        this._panel.height = 1;
        this._panel.background = "rgba(0,0,0,0.4)";
        this._panel.thickness = 0;
        this._panel.isVisible = false;
        advancedTexture.addControl(this._panel);

        // Scrollable content area
        const scrollViewer = new ScrollViewer("cac_scroll");
        scrollViewer.width = "520px";
        scrollViewer.height = "90%";
        scrollViewer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        scrollViewer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        scrollViewer.barSize = 8;
        scrollViewer.barColor = "rgba(255,255,255,0.3)";
        scrollViewer.barBackground = "transparent";
        scrollViewer.thickness = 0;
        this._panel.addControl(scrollViewer);

        // Content stack
        const content = new StackPanel("cac_content");
        content.width = "480px";
        content.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        scrollViewer.addControl(content);

        // Title
        const title = new TextBlock("cac_title", "CREATE A CLASS");
        title.color = "white";
        title.fontSize = 36;
        title.fontFamily = "Orbitron, sans-serif";
        title.height = "60px";
        title.paddingBottom = "10px";
        content.addControl(title);

        // Current loadout display
        this._currentText = new TextBlock("cac_current", "");
        this._currentText.color = "rgba(255,255,255,0.7)";
        this._currentText.fontSize = 16;
        this._currentText.fontFamily = "monospace";
        this._currentText.height = "30px";
        this._currentText.paddingBottom = "15px";
        content.addControl(this._currentText);
        this._updateCurrentText();

        // ─── Character Model ─────────────────────────────────────

        const charLabel = new TextBlock("cac_char_label", "CHARACTER");
        charLabel.color = "rgba(255,255,255,0.5)";
        charLabel.fontSize = 14;
        charLabel.fontFamily = "Rajdhani, sans-serif";
        charLabel.height = "25px";
        content.addControl(charLabel);

        const charRow = new StackPanel("cac_char_row");
        charRow.isVertical = false;
        charRow.height = "55px";
        charRow.width = "480px";
        charRow.paddingBottom = "15px";
        content.addControl(charRow);

        for (const charDef of CHARACTER_MODELS) {
            const btn = Button.CreateSimpleButton(`cac_char_${charDef.id}`, charDef.name);
            btn.width = "155px";
            btn.height = "45px";
            btn.color = "white";
            btn.fontSize = 14;
            btn.fontFamily = "Rajdhani, sans-serif";
            btn.background = INACTIVE_BG;
            btn.cornerRadius = 4;
            btn.thickness = 1;
            btn.paddingLeft = "2px";
            btn.paddingRight = "2px";

            btn.onPointerEnterObservable.add(() => {
                if (btn.background !== ACTIVE_BG) {
                    btn.background = "rgba(255,255,255,0.15)";
                }
            });
            btn.onPointerOutObservable.add(() => {
                if (btn.background !== ACTIVE_BG) {
                    btn.background = INACTIVE_BG;
                }
            });

            btn.onPointerClickObservable.add(() => {
                this._characterId = charDef.id;
                this._save();
                this._refreshHighlights();
            });

            this._characterButtons.set(charDef.id, btn);
            charRow.addControl(btn);
        }

        // ─── Preset Classes ──────────────────────────────────────

        const presetLabel = new TextBlock("cac_preset_label", "PRESET CLASSES");
        presetLabel.color = "rgba(255,255,255,0.5)";
        presetLabel.fontSize = 14;
        presetLabel.fontFamily = "Rajdhani, sans-serif";
        presetLabel.height = "25px";
        content.addControl(presetLabel);

        const presetRow = new StackPanel("cac_preset_row");
        presetRow.isVertical = false;
        presetRow.height = "65px";
        presetRow.width = "480px";
        presetRow.paddingBottom = "15px";
        content.addControl(presetRow);

        for (let i = 0; i < PRESET_CLASSES.length; i++) {
            const preset = PRESET_CLASSES[i];
            const btn = Button.CreateSimpleButton(`cac_preset_${i}`, preset.name);
            btn.width = "115px";
            btn.height = "45px";
            btn.color = "white";
            btn.fontSize = 14;
            btn.fontFamily = "Rajdhani, sans-serif";
            btn.background = INACTIVE_BG;
            btn.cornerRadius = 4;
            btn.thickness = 1;
            btn.paddingLeft = "2px";
            btn.paddingRight = "2px";

            btn.onPointerEnterObservable.add(() => {
                if (btn.background !== ACTIVE_BG) {
                    btn.background = "rgba(255,255,255,0.15)";
                }
            });
            btn.onPointerOutObservable.add(() => {
                if (btn.background !== ACTIVE_BG) {
                    btn.background = INACTIVE_BG;
                }
            });

            btn.onPointerDownObservable.add(() => {
                this._selectPreset(preset.slot1, preset.slot2);
            });

            this._presetButtons.push(btn);
            presetRow.addControl(btn);
        }

        // ─── Primary Weapons ─────────────────────────────────────

        const primaryLabel = new TextBlock("cac_primary_label", "PRIMARY WEAPON");
        primaryLabel.color = "rgba(255,255,255,0.5)";
        primaryLabel.fontSize = 14;
        primaryLabel.fontFamily = "Rajdhani, sans-serif";
        primaryLabel.height = "25px";
        content.addControl(primaryLabel);

        const primaryRow1 = new StackPanel("cac_primary_row1");
        primaryRow1.isVertical = false;
        primaryRow1.height = "55px";
        primaryRow1.width = "480px";
        content.addControl(primaryRow1);

        const primaryRow2 = new StackPanel("cac_primary_row2");
        primaryRow2.isVertical = false;
        primaryRow2.height = "55px";
        primaryRow2.width = "480px";
        primaryRow2.paddingBottom = "15px";
        content.addControl(primaryRow2);

        for (let i = 0; i < PRIMARY_WEAPONS.length; i++) {
            const weaponId = PRIMARY_WEAPONS[i];
            const btn = this._createWeaponButton(weaponId, "primary");
            this._primaryButtons.set(weaponId, btn);
            if (i < 3) {
                primaryRow1.addControl(btn);
            } else {
                primaryRow2.addControl(btn);
            }
        }

        // ─── Secondary Weapons ───────────────────────────────────

        const secondaryLabel = new TextBlock("cac_secondary_label", "SECONDARY WEAPON");
        secondaryLabel.color = "rgba(255,255,255,0.5)";
        secondaryLabel.fontSize = 14;
        secondaryLabel.fontFamily = "Rajdhani, sans-serif";
        secondaryLabel.height = "25px";
        content.addControl(secondaryLabel);

        const secondaryRow = new StackPanel("cac_secondary_row");
        secondaryRow.isVertical = false;
        secondaryRow.height = "55px";
        secondaryRow.width = "480px";
        secondaryRow.paddingBottom = "20px";
        content.addControl(secondaryRow);

        for (const weaponId of SECONDARY_WEAPONS) {
            const btn = this._createWeaponButton(weaponId, "secondary");
            this._secondaryButtons.set(weaponId, btn);
            secondaryRow.addControl(btn);
        }

        // ─── Back Button ────────────────────────────────────────

        const backBtn = Button.CreateSimpleButton("cac_back", "BACK");
        backBtn.width = "300px";
        backBtn.height = "50px";
        backBtn.color = "white";
        backBtn.fontSize = 20;
        backBtn.fontFamily = "Rajdhani, sans-serif";
        backBtn.background = INACTIVE_BG;
        backBtn.cornerRadius = 4;
        backBtn.thickness = 1;

        backBtn.onPointerEnterObservable.add(() => {
            backBtn.background = "rgba(255,255,255,0.2)";
        });
        backBtn.onPointerOutObservable.add(() => {
            backBtn.background = INACTIVE_BG;
        });
        backBtn.onPointerClickObservable.add(() => {
            onBack();
        });
        content.addControl(backBtn);

        // Initial highlight
        this._refreshHighlights();
    }

    /**
     * Shows the create-a-class panel.
     */
    public show(): void {
        this._refreshHighlights();
        this._panel.isVisible = true;
    }

    /**
     * Hides the create-a-class panel.
     */
    public hide(): void {
        this._panel.isVisible = false;
    }

    /**
     * Whether the panel is currently visible.
     */
    public get isVisible(): boolean {
        return this._panel.isVisible;
    }

    /**
     * Creates a weapon selection button.
     * @param weaponId - The weapon ID.
     * @param slot - Whether this is a "primary" or "secondary" slot button.
     * @returns The configured Button control.
     */
    private _createWeaponButton(weaponId: WeaponId, slot: "primary" | "secondary"): Button {
        const stats = WEAPON_STATS[weaponId];
        const unlockReq = WEAPON_UNLOCK_REQUIREMENTS.find(r => r.weaponId === weaponId);
        const unlockLevel = unlockReq?.unlockLevel ?? 1;
        const manager = ProgressionManager.getInstance();
        const isUnlocked = manager.isWeaponUnlocked(weaponId);

        const label = isUnlocked ? stats.name : `${stats.name} (LVL ${unlockLevel})`;

        const btn = Button.CreateSimpleButton(`cac_${slot}_${weaponId}`, label);
        btn.width = "155px";
        btn.height = "45px";
        btn.fontSize = 13;
        btn.fontFamily = "Rajdhani, sans-serif";
        btn.cornerRadius = 4;
        btn.paddingLeft = "2px";
        btn.paddingRight = "2px";

        if (isUnlocked) {
            btn.color = "white";
            btn.background = INACTIVE_BG;
            btn.thickness = 1;

            btn.onPointerEnterObservable.add(() => {
                if (btn.background !== ACTIVE_BG) {
                    btn.background = "rgba(255,255,255,0.15)";
                }
            });
            btn.onPointerOutObservable.add(() => {
                if (btn.background !== ACTIVE_BG) {
                    btn.background = INACTIVE_BG;
                }
            });

            btn.onPointerClickObservable.add(() => {
                if (slot === "primary") {
                    this._slot1 = weaponId;
                } else {
                    this._slot2 = weaponId;
                }
                this._save();
                this._refreshHighlights();
            });
        } else {
            btn.color = LOCKED_COLOR;
            btn.background = LOCKED_BG;
            btn.thickness = 1;
            btn.isHitTestVisible = false;
        }

        return btn;
    }

    /**
     * Selects a preset class.
     * @param slot1 - Primary weapon ID.
     * @param slot2 - Secondary weapon ID.
     */
    private _selectPreset(slot1: WeaponId, slot2: WeaponId): void {
        this._slot1 = slot1;
        this._slot2 = slot2;
        this._save();
        this._refreshHighlights();
    }

    /**
     * Refreshes the highlight state of all weapon, character, and preset buttons.
     */
    private _refreshHighlights(): void {
        // Character buttons
        for (const [id, btn] of this._characterButtons) {
            const isActive = id === this._characterId;
            btn.background = isActive ? ACTIVE_BG : INACTIVE_BG;
            btn.thickness = isActive ? 2 : 1;
        }

        // Primary buttons
        for (const [id, btn] of this._primaryButtons) {
            const manager = ProgressionManager.getInstance();
            if (!manager.isWeaponUnlocked(id)) continue;
            const isActive = id === this._slot1;
            btn.background = isActive ? ACTIVE_BG : INACTIVE_BG;
            btn.thickness = isActive ? 2 : 1;
        }

        // Secondary buttons
        for (const [id, btn] of this._secondaryButtons) {
            const manager = ProgressionManager.getInstance();
            if (!manager.isWeaponUnlocked(id)) continue;
            const isActive = id === this._slot2;
            btn.background = isActive ? ACTIVE_BG : INACTIVE_BG;
            btn.thickness = isActive ? 2 : 1;
        }

        // Preset buttons
        for (let i = 0; i < PRESET_CLASSES.length; i++) {
            const preset = PRESET_CLASSES[i];
            const isActive = this._slot1 === preset.slot1 && this._slot2 === preset.slot2;
            this._presetButtons[i].background = isActive ? ACTIVE_BG : INACTIVE_BG;
            this._presetButtons[i].thickness = isActive ? 2 : 1;
        }

        this._updateCurrentText();
    }

    /**
     * Updates the current loadout display text.
     */
    private _updateCurrentText(): void {
        const name1 = WEAPON_STATS[this._slot1].name;
        const name2 = WEAPON_STATS[this._slot2].name;
        const charName = CHARACTER_MODELS.find((m) => m.id === this._characterId)?.name ?? this._characterId;
        this._currentText.text = `${charName} — ${name1} / ${name2}`;
    }

    /**
     * Saves the current loadout to localStorage.
     */
    private _save(): void {
        localStorage.setItem(SLOT1_KEY, this._slot1);
        localStorage.setItem(SLOT2_KEY, this._slot2);
        localStorage.setItem(CHARACTER_MODEL_KEY, this._characterId);
    }

    /**
     * Returns the saved loadout from localStorage, validating IDs.
     * Falls back to defaults if saved values are invalid or locked.
     * @returns The slot1, slot2, and characterId.
     */
    public static getLoadout(): { slot1: WeaponId; slot2: WeaponId; characterId: string } {
        const saved1 = localStorage.getItem(SLOT1_KEY) as WeaponId | null;
        const saved2 = localStorage.getItem(SLOT2_KEY) as WeaponId | null;
        const savedChar = localStorage.getItem(CHARACTER_MODEL_KEY);

        const slot1: WeaponId = saved1 && saved1 in WEAPON_STATS ? saved1 : DEFAULT_SLOT1;
        const slot2: WeaponId = saved2 && saved2 in WEAPON_STATS ? saved2 : DEFAULT_SLOT2;
        const characterId = savedChar && CHARACTER_MODELS.some((m) => m.id === savedChar)
            ? savedChar
            : DEFAULT_CHARACTER_ID;

        return { slot1, slot2, characterId };
    }
}
