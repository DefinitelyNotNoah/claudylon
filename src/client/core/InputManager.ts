/**
 * Centralized input state manager.
 * Tracks keyboard keys, accumulates mouse movement, and manages pointer lock.
 * @module client/core/InputManager
 */

import {
    DEFAULT_MOUSE_SENSITIVITY,
    MIN_MOUSE_SENSITIVITY,
    MAX_MOUSE_SENSITIVITY,
    SENSITIVITY_STORAGE_KEY,
} from "../../shared/constants";

/**
 * Reads and stores input state each frame. Manages pointer lock lifecycle.
 * Mouse movement is accumulated between reads and reset on consumption.
 */
export class InputManager {
    private _canvas: HTMLCanvasElement;
    private _keys: Map<string, boolean> = new Map();
    private _keysJustPressed: Map<string, boolean> = new Map();
    private _mouseSensitivity: number;
    private _mouseMovementX: number = 0;
    private _mouseMovementY: number = 0;
    private _isPointerLocked: boolean = false;
    private _pointerLockEnabled: boolean = true;
    private _inputSuppressed: boolean = false;

    private _onKeyDown: (e: KeyboardEvent) => void;
    private _onKeyUp: (e: KeyboardEvent) => void;
    private _onMouseMove: (e: MouseEvent) => void;
    private _onMouseDown: (e: MouseEvent) => void;
    private _onMouseUp: (e: MouseEvent) => void;
    private _onPointerLockChange: () => void;
    private _onCanvasClick: () => void;

    /**
     * Creates the input manager and registers all event listeners.
     * @param canvas - The game canvas, used for pointer lock requests.
     */
    constructor(canvas: HTMLCanvasElement) {
        this._canvas = canvas;

        const stored = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
        this._mouseSensitivity = stored ? parseFloat(stored) : DEFAULT_MOUSE_SENSITIVITY;

        this._onKeyDown = (e: KeyboardEvent) => {
            // When console/ImGui is consuming input, only allow Backquote and L through
            if (this._inputSuppressed && e.code !== "Backquote" && e.code !== "KeyL") return;

            if (e.code === "Space" || e.code === "Tab") {
                e.preventDefault();
            }
            if (!this._keys.get(e.code)) {
                this._keysJustPressed.set(e.code, true);
            }
            this._keys.set(e.code, true);
        };

        this._onKeyUp = (e: KeyboardEvent) => {
            this._keys.set(e.code, false);
            this._keysJustPressed.set(e.code, false);
        };

        // Rolling average of recent mouse movement magnitude, used to
        // detect and discard Chromium pointer lock spikes on Windows 11
        // (https://github.com/mrdoob/three.js/issues/27040).
        let movingAvg = 5;

        this._onMouseMove = (e: MouseEvent) => {
            if (this._isPointerLocked) {
                const absMx = Math.abs(e.movementX);
                const absMy = Math.abs(e.movementY);
                const magnitude = Math.max(absMx, absMy);

                // If this event is vastly larger than the rolling average,
                // it's a Chromium spike — drop it entirely.
                if (magnitude > 50 && magnitude > movingAvg * 20) {
                    return;
                }

                // Update rolling average (fast decay)
                movingAvg = movingAvg * 0.9 + magnitude * 0.1;

                this._mouseMovementX += e.movementX;
                this._mouseMovementY += e.movementY;
            }
        };

        this._onMouseDown = (e: MouseEvent) => {
            if (this._isPointerLocked) {
                if (e.button === 0) this._keys.set("MouseLeft", true);
                if (e.button === 2) this._keys.set("MouseRight", true);
            }
        };

        this._onMouseUp = (e: MouseEvent) => {
            if (e.button === 0) this._keys.set("MouseLeft", false);
            if (e.button === 2) this._keys.set("MouseRight", false);
        };

        this._onPointerLockChange = () => {
            this._isPointerLocked = document.pointerLockElement === this._canvas;
            if (!this._isPointerLocked) {
                this._keys.set("MouseLeft", false);
                this._keys.set("MouseRight", false);
            }
        };

        this._onCanvasClick = () => {
            if (!this._isPointerLocked && this._pointerLockEnabled) {
                /* Catch rejections silently — the browser rejects during
                   the ~1.5s cooldown after ESC exits pointer lock. The next
                   click after the cooldown expires will succeed. */
                try {
                    const p = this._canvas.requestPointerLock() as unknown;
                    if (p instanceof Promise) {
                        (p as Promise<void>).catch(() => {});
                    }
                } catch (_) { /* non-promise rejection in older browsers */ }
            }
        };

        window.addEventListener("keydown", this._onKeyDown);
        window.addEventListener("keyup", this._onKeyUp);
        document.addEventListener("mousemove", this._onMouseMove);
        document.addEventListener("mousedown", this._onMouseDown);
        document.addEventListener("mouseup", this._onMouseUp);
        document.addEventListener("pointerlockchange", this._onPointerLockChange);
        this._canvas.addEventListener("pointerdown", this._onCanvasClick, true);
    }

    /** True while W is held. */
    public get forward(): boolean {
        return this._keys.get("KeyW") ?? false;
    }

    /** True while S is held. */
    public get backward(): boolean {
        return this._keys.get("KeyS") ?? false;
    }

    /** True while A is held. */
    public get left(): boolean {
        return this._keys.get("KeyA") ?? false;
    }

    /** True while D is held. */
    public get right(): boolean {
        return this._keys.get("KeyD") ?? false;
    }

    /** True only on the frame Space is first pressed (one-shot). */
    public get jump(): boolean {
        const pressed = this._keysJustPressed.get("Space") ?? false;
        if (pressed) {
            this._keysJustPressed.set("Space", false);
        }
        return pressed;
    }

    /** True while key 1 is held. */
    public get weapon1(): boolean {
        return this._keys.get("Digit1") ?? false;
    }

    /** True while key 2 is held. */
    public get weapon2(): boolean {
        return this._keys.get("Digit2") ?? false;
    }

    /** True while left mouse button is held. */
    public get fire(): boolean {
        return this._keys.get("MouseLeft") ?? false;
    }

    /** True only on the frame R is first pressed (one-shot). */
    public get reload(): boolean {
        const pressed = this._keysJustPressed.get("KeyR") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyR", false);
        }
        return pressed;
    }

    /** True while TAB is held. */
    public get tab(): boolean {
        return this._keys.get("Tab") ?? false;
    }

    /** True only on the frame V is first pressed (one-shot). */
    public get noclip(): boolean {
        const pressed = this._keysJustPressed.get("KeyV") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyV", false);
        }
        return pressed;
    }

    /** True only on the frame N is first pressed (one-shot). */
    public get showColliders(): boolean {
        const pressed = this._keysJustPressed.get("KeyN") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyN", false);
        }
        return pressed;
    }

    /** True only on the frame P is first pressed (one-shot). */
    public get pause(): boolean {
        const pressed = this._keysJustPressed.get("KeyP") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyP", false);
        }
        return pressed;
    }

    /** True while Q is held (lean left). */
    public get leanLeft(): boolean {
        return this._keys.get("KeyQ") ?? false;
    }

    /** True while E is held (lean right). */
    public get leanRight(): boolean {
        return this._keys.get("KeyE") ?? false;
    }

    /** True only on the frame F is first pressed (one-shot). */
    public get interact(): boolean {
        const pressed = this._keysJustPressed.get("KeyF") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyF", false);
        }
        return pressed;
    }

    /** True only on the frame B is first pressed (one-shot). */
    public get debugNavmesh(): boolean {
        const pressed = this._keysJustPressed.get("KeyB") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyB", false);
        }
        return pressed;
    }

    /** True only on the frame backtick is first pressed (one-shot). */
    public get openConsole(): boolean {
        const pressed = this._keysJustPressed.get("Backquote") ?? false;
        if (pressed) {
            this._keysJustPressed.set("Backquote", false);
        }
        return pressed;
    }

    /** True only on the frame L is first pressed (one-shot). */
    public get toggleImGui(): boolean {
        const pressed = this._keysJustPressed.get("KeyL") ?? false;
        if (pressed) {
            this._keysJustPressed.set("KeyL", false);
        }
        return pressed;
    }

    /**
     * When true, all game input keys are suppressed (except Backquote for console toggle).
     * Used by the developer console to prevent game input while typing commands.
     */
    public get inputSuppressed(): boolean {
        return this._inputSuppressed;
    }

    /**
     * Enables or disables input suppression. Clears all held keys when enabling.
     * @param value - True to suppress game input, false to restore.
     */
    public set inputSuppressed(value: boolean) {
        this._inputSuppressed = value;
        if (value) {
            this._keys.clear();
            this._keysJustPressed.clear();
        }
    }

    /**
     * Returns accumulated horizontal mouse movement since last read, then resets.
     * @returns Horizontal mouse delta in pixels.
     */
    public consumeMouseX(): number {
        const val = this._mouseMovementX;
        this._mouseMovementX = 0;
        return val;
    }

    /**
     * Returns accumulated vertical mouse movement since last read, then resets.
     * @returns Vertical mouse delta in pixels.
     */
    public consumeMouseY(): number {
        const val = this._mouseMovementY;
        this._mouseMovementY = 0;
        return val;
    }

    /** Current mouse sensitivity in radians per pixel. Reads live from localStorage. */
    public get sensitivity(): number {
        const stored = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
        if (stored) {
            this._mouseSensitivity = parseFloat(stored);
        }
        return this._mouseSensitivity;
    }

    /**
     * Sets mouse sensitivity and persists to localStorage.
     * @param value - New sensitivity value, clamped to valid range.
     */
    public set sensitivity(value: number) {
        this._mouseSensitivity = Math.max(MIN_MOUSE_SENSITIVITY, Math.min(MAX_MOUSE_SENSITIVITY, value));
        localStorage.setItem(SENSITIVITY_STORAGE_KEY, this._mouseSensitivity.toString());
    }

    /** Whether the pointer is currently locked to the canvas. */
    public get isPointerLocked(): boolean {
        return this._isPointerLocked;
    }

    /**
     * Enables or disables automatic pointer lock on canvas click.
     * Disable while the pause menu is open to prevent clicks on UI buttons
     * from re-locking the pointer.
     * @param enabled - Whether canvas clicks should request pointer lock.
     */
    public set pointerLockEnabled(enabled: boolean) {
        this._pointerLockEnabled = enabled;
    }

    /**
     * Removes all event listeners and releases pointer lock.
     */
    public dispose(): void {
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
        document.removeEventListener("mousemove", this._onMouseMove);
        document.removeEventListener("mousedown", this._onMouseDown);
        document.removeEventListener("mouseup", this._onMouseUp);
        document.removeEventListener("pointerlockchange", this._onPointerLockChange);
        this._canvas.removeEventListener("pointerdown", this._onCanvasClick, true);

        if (this._isPointerLocked) {
            document.exitPointerLock();
        }
    }
}
