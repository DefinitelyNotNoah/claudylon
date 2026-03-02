/**
 * Developer console UI overlay.
 * Uses a native DOM input element for command entry and
 * Babylon.js GUI for the output log and autocomplete panel.
 * @module client/ui/DeveloperConsoleUI
 */

import { Scene } from "@babylonjs/core/scene";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { ScrollViewer } from "@babylonjs/gui/2D/controls/scrollViewers/scrollViewer";
import { Control } from "@babylonjs/gui/2D/controls/control";

import type { ConsoleCommandRegistry } from "../core/ConsoleCommandRegistry";
import { createFullscreenUI } from "./uiUtils";

/** Maximum number of log lines kept in memory. */
const MAX_LOG_LINES = 200;

/** Maximum number of commands in history. */
const MAX_HISTORY = 50;

/** Maximum autocomplete suggestions shown. */
const MAX_SUGGESTIONS = 8;

/** Height of the console panel as a fraction of screen height. */
const CONSOLE_HEIGHT = 0.45;

/**
 * Developer console overlay with command input, output log, and autocomplete.
 */
export class DeveloperConsoleUI {
    private _scene: Scene;
    private _registry: ConsoleCommandRegistry;
    private _texture: AdvancedDynamicTexture;
    private _root: Rectangle;
    private _logTextBlock: TextBlock;
    private _scrollViewer: ScrollViewer;
    private _autocompletePanel: StackPanel;
    private _autocompleteRoot: Rectangle;
    private _inputEl: HTMLInputElement;
    private _logLines: string[] = [];
    private _history: string[] = [];
    private _historyIndex: number = -1;
    private _visible: boolean = false;
    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;

    /** Called when the console is shown. MatchScene uses this to suppress input. */
    public onShow: (() => void) | null = null;

    /** Called when the console is hidden. MatchScene uses this to restore input. */
    public onHide: (() => void) | null = null;

    /**
     * Creates the developer console UI.
     * @param scene - The Babylon.js scene.
     * @param registry - The command registry for execution and autocomplete.
     */
    constructor(scene: Scene, registry: ConsoleCommandRegistry) {
        this._scene = scene;
        this._registry = registry;
        this._texture = createFullscreenUI("dev_console_ui", scene);

        // ─── Main console panel (top of screen) ─────────────────────
        this._root = new Rectangle("dev_console_root");
        this._root.width = 1;
        this._root.height = CONSOLE_HEIGHT;
        this._root.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._root.background = "rgba(0, 0, 0, 0.88)";
        this._root.thickness = 0;
        this._root.isVisible = false;
        this._root.zIndex = 999;
        this._texture.addControl(this._root);

        // ─── Scrollable output log ──────────────────────────────────
        this._scrollViewer = new ScrollViewer("dev_console_scroll");
        this._scrollViewer.width = 1;
        this._scrollViewer.height = 1;
        this._scrollViewer.paddingLeftInPixels = 10;
        this._scrollViewer.paddingRightInPixels = 10;
        this._scrollViewer.paddingTopInPixels = 8;
        this._scrollViewer.paddingBottomInPixels = 8;
        this._scrollViewer.thickness = 0;
        this._scrollViewer.barSize = 8;
        this._scrollViewer.barColor = "rgba(255,255,255,0.3)";
        this._scrollViewer.barBackground = "transparent";
        this._root.addControl(this._scrollViewer);

        this._logTextBlock = new TextBlock("dev_console_log", "");
        this._logTextBlock.fontFamily = "monospace";
        this._logTextBlock.fontSize = 14;
        this._logTextBlock.color = "#00FF00";
        this._logTextBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this._logTextBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._logTextBlock.textWrapping = 1; // TextWrapping.WordWrap
        this._logTextBlock.resizeToFit = true;
        this._logTextBlock.paddingBottomInPixels = 40;
        this._scrollViewer.addControl(this._logTextBlock);

        // ─── Autocomplete panel (below console) ─────────────────────
        this._autocompleteRoot = new Rectangle("dev_console_autocomplete_root");
        this._autocompleteRoot.width = 1;
        this._autocompleteRoot.adaptHeightToChildren = true;
        this._autocompleteRoot.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._autocompleteRoot.topInPixels = 0; // positioned dynamically
        this._autocompleteRoot.background = "rgba(20, 20, 20, 0.95)";
        this._autocompleteRoot.thickness = 0;
        this._autocompleteRoot.isVisible = false;
        this._autocompleteRoot.zIndex = 1000;
        this._texture.addControl(this._autocompleteRoot);

        this._autocompletePanel = new StackPanel("dev_console_autocomplete");
        this._autocompletePanel.width = 1;
        this._autocompletePanel.isVertical = true;
        this._autocompletePanel.paddingLeftInPixels = 10;
        this._autocompletePanel.paddingRightInPixels = 10;
        this._autocompletePanel.paddingTopInPixels = 4;
        this._autocompletePanel.paddingBottomInPixels = 4;
        this._autocompleteRoot.addControl(this._autocompletePanel);

        // ─── Native DOM input element ───────────────────────────────
        this._inputEl = document.createElement("input");
        this._inputEl.type = "text";
        this._inputEl.spellcheck = false;
        this._inputEl.autocomplete = "off";
        this._inputEl.style.cssText = [
            "position: fixed",
            "left: 0",
            "width: 100%",
            "height: 32px",
            "background: rgba(0,0,0,0.95)",
            "color: #00FF00",
            "font-family: monospace",
            "font-size: 15px",
            "border: none",
            "border-top: 1px solid #333",
            "padding: 4px 10px",
            "outline: none",
            "z-index: 10000",
            "display: none",
            "box-sizing: border-box",
        ].join("; ");
        this._inputEl.placeholder = "] Type a command...";
        document.body.appendChild(this._inputEl);

        // ─── Input event handlers ───────────────────────────────────
        this._inputEl.addEventListener("input", () => {
            this._updateAutocomplete();
        });

        this._onKeyDown = (e: KeyboardEvent) => {
            if (!this._visible) return;

            if (e.code === "Backquote" || e.code === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                return;
            }

            if (e.code === "Enter") {
                e.preventDefault();
                const text = this._inputEl.value.trim();
                if (text) {
                    this._executeInput(text);
                }
                return;
            }

            if (e.code === "Tab") {
                e.preventDefault();
                this._acceptSuggestion();
                return;
            }

            if (e.code === "ArrowUp") {
                e.preventDefault();
                this._navigateHistory(-1);
                return;
            }

            if (e.code === "ArrowDown") {
                e.preventDefault();
                this._navigateHistory(1);
                return;
            }
        };

        // Use capture phase so it fires before InputManager
        window.addEventListener("keydown", this._onKeyDown, true);
    }

    /** Whether the console is currently visible. */
    public get isVisible(): boolean {
        return this._visible;
    }

    /**
     * Shows the console overlay and focuses the input.
     */
    public show(): void {
        if (this._visible) return;
        this._visible = true;
        this._root.isVisible = true;

        // Position and show DOM input
        const engine = this._scene.getEngine();
        const canvas = engine.getRenderingCanvas();
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const consoleBottom = rect.top + rect.height * CONSOLE_HEIGHT;
            this._inputEl.style.top = `${consoleBottom}px`;

            // Scale DOM input to match Babylon GUI idealWidth scaling
            const scaleFactor = rect.width / 1920;
            const inputHeight = Math.round(32 * scaleFactor);
            const inputFontSize = Math.round(15 * scaleFactor);
            this._inputEl.style.height = `${inputHeight}px`;
            this._inputEl.style.fontSize = `${inputFontSize}px`;
            this._inputEl.style.padding = `${Math.round(4 * scaleFactor)}px ${Math.round(10 * scaleFactor)}px`;

            // Autocomplete below input (in idealWidth-scaled pixels)
            this._autocompleteRoot.topInPixels = (rect.height * CONSOLE_HEIGHT + inputHeight) / scaleFactor;
        }
        this._inputEl.style.display = "block";
        this._inputEl.value = "";
        this._historyIndex = -1;

        // Delay focus to avoid the backtick character appearing in input
        requestAnimationFrame(() => {
            this._inputEl.focus();
        });

        this._updateAutocomplete();
        this.onShow?.();
    }

    /**
     * Hides the console overlay and restores game input.
     */
    public hide(): void {
        if (!this._visible) return;
        this._visible = false;
        this._root.isVisible = false;
        this._inputEl.style.display = "none";
        this._inputEl.blur();
        this._autocompleteRoot.isVisible = false;
        this.onHide?.();
    }

    /**
     * Adds a line to the console output log.
     * @param message - Text to append.
     * @param color - Optional text color (defaults to green).
     */
    public log(message: string, _color?: string): void {
        this._logLines.push(message);
        if (this._logLines.length > MAX_LOG_LINES) {
            this._logLines.shift();
        }
        this._logTextBlock.text = this._logLines.join("\n");

        // Auto-scroll to bottom
        requestAnimationFrame(() => {
            this._scrollViewer.verticalBar.value = 1;
        });
    }

    /**
     * Executes a command string, logs input and output.
     * @param text - Raw command input.
     */
    private _executeInput(text: string): void {
        // Add to history
        if (this._history.length === 0 || this._history[this._history.length - 1] !== text) {
            this._history.push(text);
            if (this._history.length > MAX_HISTORY) {
                this._history.shift();
            }
        }
        this._historyIndex = -1;

        // Log input
        this.log(`> ${text}`);

        // Execute
        const output = this._registry.execute(text);
        if (output) {
            this.log(output);
        }

        // Clear input
        this._inputEl.value = "";
        this._updateAutocomplete();
    }

    /**
     * Navigates command history with Up/Down arrows.
     * @param direction - -1 for older, +1 for newer.
     */
    private _navigateHistory(direction: number): void {
        if (this._history.length === 0) return;

        if (this._historyIndex === -1) {
            if (direction === -1) {
                this._historyIndex = this._history.length - 1;
            } else {
                return;
            }
        } else {
            this._historyIndex += direction;
        }

        if (this._historyIndex < 0) {
            this._historyIndex = 0;
        } else if (this._historyIndex >= this._history.length) {
            this._historyIndex = -1;
            this._inputEl.value = "";
            this._updateAutocomplete();
            return;
        }

        this._inputEl.value = this._history[this._historyIndex];
        this._updateAutocomplete();
    }

    /**
     * Updates the autocomplete suggestion panel based on current input.
     */
    private _updateAutocomplete(): void {
        // Clear existing suggestions
        const children = this._autocompletePanel.children.slice();
        for (const child of children) {
            this._autocompletePanel.removeControl(child);
            child.dispose();
        }

        const text = this._inputEl.value.trim();
        if (!text) {
            this._autocompleteRoot.isVisible = false;
            return;
        }

        const tokens = text.split(/\s+/);
        let suggestions: { display: string; fill: string }[] = [];

        if (tokens.length === 1) {
            // Suggest command names
            const matches = this._registry.getSuggestions(tokens[0]);
            suggestions = matches.map(name => {
                const cmd = this._registry.getCommand(name);
                const desc = cmd ? cmd.description : "";
                return { display: `${name}  ${desc}`, fill: name };
            });
        } else {
            // Suggest parameter values
            const cmdName = tokens[0];
            const paramIndex = tokens.length - 2;
            const partial = tokens[tokens.length - 1];
            const paramMatches = this._registry.getParamSuggestions(cmdName, paramIndex, partial);
            const baseParts = tokens.slice(0, -1).join(" ");
            suggestions = paramMatches.map(opt => {
                return { display: `${opt}`, fill: `${baseParts} ${opt}` };
            });
        }

        if (suggestions.length === 0) {
            this._autocompleteRoot.isVisible = false;
            return;
        }

        // Show top N suggestions
        const shown = suggestions.slice(0, MAX_SUGGESTIONS);
        for (const suggestion of shown) {
            const tb = new TextBlock();
            tb.text = suggestion.display;
            tb.fontFamily = "monospace";
            tb.fontSize = 13;
            tb.color = "#AAFFAA";
            tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            tb.height = "22px";
            tb.paddingLeftInPixels = 4;
            this._autocompletePanel.addControl(tb);
        }

        this._autocompleteRoot.isVisible = true;

        // Store suggestions for Tab completion
        (this as any)._currentSuggestions = suggestions;
    }

    /**
     * Accepts the first autocomplete suggestion into the input field.
     */
    private _acceptSuggestion(): void {
        const suggestions = (this as any)._currentSuggestions as { display: string; fill: string }[] | undefined;
        if (!suggestions || suggestions.length === 0) return;

        this._inputEl.value = suggestions[0].fill + " ";
        this._updateAutocomplete();
    }

    /**
     * Disposes all controls, textures, and event listeners.
     */
    public dispose(): void {
        if (this._onKeyDown) {
            window.removeEventListener("keydown", this._onKeyDown, true);
            this._onKeyDown = null;
        }
        this._inputEl.remove();
        this._texture.dispose();
    }
}
