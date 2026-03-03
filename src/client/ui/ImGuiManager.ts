/**
 * Manages the Dear ImGui overlay canvas and render loop integration.
 * Singleton — initialized once by GameManager, persists across scene transitions.
 * @module client/ui/ImGuiManager
 */

import { ImGui, ImGuiImplWeb, ImGuiImplOpenGL3 } from "@mori2003/jsimgui";

/**
 * Map from browser MouseEvent.button to ImGui mouse button index.
 * Browser: 0=Left, 1=Middle, 2=Right
 * ImGui:   0=Left, 1=Right,  2=Middle
 * Hardcoded to avoid accessing ImGui enums before WASM init.
 */
const BROWSER_TO_IMGUI_BUTTON: Record<number, number> = {
    0: 0, // Left  → ImGuiMouseButton_Left
    1: 2, // Middle → ImGuiMouseButton_Middle
    2: 1, // Right  → ImGuiMouseButton_Right
};

/**
 * ImGuiManager creates a transparent `<canvas>` overlay on top of the Babylon
 * canvas and drives the Dear ImGui render loop. Each game scene can register a
 * draw callback that is invoked every frame while the overlay is visible.
 *
 * The overlay canvas always has `pointer-events: none` — it never intercepts
 * browser pointer events. Instead, ImGui receives mouse input via document-level
 * listeners that feed its IO API directly. This lets Babylon GUI (pause menu,
 * etc.) coexist without any event forwarding or z-index conflicts.
 */
export class ImGuiManager {
    private static _instance: ImGuiManager;

    /** The overlay canvas element owned by ImGui. */
    private _canvas!: HTMLCanvasElement;

    /** Reference to the game's main canvas (for sizing). */
    private _gameCanvas!: HTMLCanvasElement;

    /** Whether ImGuiImplWeb.Init() has completed. */
    private _initialized: boolean = false;

    /** Whether the ImGui overlay is currently visible (toggled by L). */
    private _visible: boolean = false;

    /** Scene-specific draw callback invoked inside the tab bar each frame. */
    private _drawCallback: (() => void) | null = null;

    /** Cached WantCaptureMouse from the last frame. */
    private _wantCaptureMouse: boolean = false;

    /** Cached WantCaptureKeyboard from the last frame. */
    private _wantCaptureKeyboard: boolean = false;

    /** Whether we've logged the first render call (debug). */
    private _loggedFirstRender: boolean = false;

    /** UI scale factor (persisted to localStorage). */
    private _uiScale: [number] = [1.0];

    /** Bound event handlers (for cleanup). */
    private _cleanupFns: Array<() => void> = [];

    private constructor() {}

    /**
     * Returns the singleton instance (creates it on first call).
     * @returns The ImGuiManager instance.
     */
    public static getInstance(): ImGuiManager {
        if (!ImGuiManager._instance) {
            ImGuiManager._instance = new ImGuiManager();
        }
        return ImGuiManager._instance;
    }

    /**
     * Creates the overlay canvas and initializes the ImGui WebGL2 context.
     * Must be called once after the Babylon engine is created.
     * @param gameCanvas - The Babylon.js game canvas element.
     */
    public async initialize(gameCanvas: HTMLCanvasElement): Promise<void> {
        if (this._initialized) return;

        this._gameCanvas = gameCanvas;

        // Create overlay canvas — always pointer-events: none so it never
        // blocks Babylon GUI or any other DOM interaction.
        const canvas = document.createElement("canvas");
        canvas.id = "imgui-canvas";
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.zIndex = "100";
        canvas.style.pointerEvents = "none";
        canvas.style.display = "none";
        const parent = gameCanvas.parentElement!;
        parent.style.overflow = "hidden";
        parent.style.position = "relative";
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        parent.appendChild(canvas);
        this._canvas = canvas;

        // Pre-create WebGL2 context with alpha enabled so the canvas background
        // is transparent and the game shows through. jsimgui will reuse this context.
        canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true });

        // Initialize jsimgui (will reuse the existing WebGL2 context).
        // jsimgui registers its own mouse/keyboard listeners on the canvas,
        // but since pointer-events is "none", those listeners never fire.
        // We replace them with document-level listeners below.
        try {
            await ImGuiImplWeb.Init({ canvas, backend: "webgl2" });
            console.log("[ImGui] Init completed successfully");
        } catch (err) {
            console.error("[ImGui] Init failed:", err);
            return;
        }

        // Configure style
        const style = ImGui.GetStyle();
        style.WindowRounding = 6;
        style.FrameRounding = 3;
        style.GrabRounding = 3;
        style.Alpha = 0.95;

        const io = ImGui.GetIO();

        // The overlay canvas has pointer-events: none, so it never receives
        // DOM focus. Tell ImGui we are focused and prevent focus-loss from
        // clearing input state (which would silently eat mouse button events).
        io.AddFocusEvent(true);
        io.ConfigDebugIgnoreFocusLoss = true;

        // ─── Document-level mouse input for ImGui ───────────────────
        // Since the overlay canvas has pointer-events: none, jsimgui's
        // built-in canvas listeners are inert. We feed ImGui's IO from
        // document-level listeners instead, converting coordinates to
        // be relative to the canvas position.
        this._setupDocumentMouseListeners();

        // Restore persisted UI scale
        const savedScale = localStorage.getItem("fps_imgui_scale");
        if (savedScale !== null) {
            const parsed = parseFloat(savedScale);
            if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3.0) {
                this._uiScale[0] = parsed;
            }
        }
        // jsimgui uses style.FontScaleMain for global font scaling
        style.FontScaleMain = this._uiScale[0];

        this._initialized = true;
        console.log("[ImGui] Initialized and ready");
    }

    /**
     * Sets up document-level mouse listeners that feed ImGui's IO directly.
     * Only active when the overlay is visible.
     */
    private _setupDocumentMouseListeners(): void {
        const io = ImGui.GetIO();
        const scrollSpeed = 0.01;

        const feedMousePos = (e: MouseEvent | PointerEvent) => {
            if (!this._visible) return;
            const rect = this._canvas.getBoundingClientRect();
            // Scale CSS-pixel mouse position to physical pixels to match
            // the overridden DisplaySize (see render()).
            const dpr = window.devicePixelRatio || 1;
            io.AddMousePosEvent(
                (e.clientX - rect.left) * dpr,
                (e.clientY - rect.top) * dpr,
            );
        };

        // Use pointerdown/pointerup — these fire before mousedown/mouseup
        // and are more reliable across pointer lock transitions.
        const onPointerDown = (e: PointerEvent) => {
            if (!this._visible) return;
            const btn = BROWSER_TO_IMGUI_BUTTON[e.button];
            if (btn !== undefined) {
                io.AddMouseButtonEvent(btn, true);
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            if (!this._visible) return;
            const btn = BROWSER_TO_IMGUI_BUTTON[e.button];
            if (btn !== undefined) {
                io.AddMouseButtonEvent(btn, false);
            }
        };

        const onWheel = (e: WheelEvent) => {
            if (!this._visible) return;
            if (this._wantCaptureMouse) {
                io.AddMouseWheelEvent(-e.deltaX * scrollSpeed, -e.deltaY * scrollSpeed);
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (!this._visible || !this._wantCaptureKeyboard) return;
            // Let jsimgui's internal handler process it — dispatch on canvas
            this._canvas.dispatchEvent(new KeyboardEvent(e.type, e));
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (!this._visible || !this._wantCaptureKeyboard) return;
            this._canvas.dispatchEvent(new KeyboardEvent(e.type, e));
        };

        // Use window + capture phase to ensure we receive events before
        // anything else can consume them (e.g. Babylon's engine, pointer lock).
        // Listen for both mousemove and pointermove — during pointer capture
        // (which Babylon's engine may activate), only pointermove fires.
        window.addEventListener("mousemove", feedMousePos, true);
        window.addEventListener("pointermove", feedMousePos, true);
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("pointerup", onPointerUp, true);
        window.addEventListener("wheel", onWheel, true);
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);

        this._cleanupFns.push(
            () => window.removeEventListener("mousemove", feedMousePos, true),
            () => window.removeEventListener("pointermove", feedMousePos, true),
            () => window.removeEventListener("pointerdown", onPointerDown, true),
            () => window.removeEventListener("pointerup", onPointerUp, true),
            () => window.removeEventListener("wheel", onWheel, true),
            () => window.removeEventListener("keydown", onKeyDown, true),
            () => window.removeEventListener("keyup", onKeyUp, true),
        );
    }

    /** Whether the ImGui overlay is currently visible. */
    public get isVisible(): boolean {
        return this._visible;
    }

    /** Whether ImGui wants to consume mouse input this frame. */
    public get wantCaptureMouse(): boolean {
        return this._wantCaptureMouse;
    }

    /** Whether ImGui wants to consume keyboard input this frame. */
    public get wantCaptureKeyboard(): boolean {
        return this._wantCaptureKeyboard;
    }

    /**
     * Toggles ImGui overlay visibility. When hidden, the overlay canvas
     * is not displayed and rendering is skipped entirely.
     */
    public toggle(): void {
        this._visible = !this._visible;
        if (this._visible) {
            this._canvas.style.display = "block";
            this._loggedFirstRender = false;
        } else {
            this._canvas.style.display = "none";
            this._wantCaptureMouse = false;
            this._wantCaptureKeyboard = false;
        }
        console.log(`[ImGui] Overlay ${this._visible ? "SHOWN" : "HIDDEN"}`);
    }

    /**
     * Hides the ImGui overlay if it's currently visible. Used to ensure
     * clean state on scene transitions without toggling.
     */
    public hide(): void {
        if (!this._visible) return;
        this._visible = false;
        this._canvas.style.display = "none";
        this._wantCaptureMouse = false;
        this._wantCaptureKeyboard = false;
        console.log("[ImGui] Overlay HIDDEN (explicit)");
    }

    /**
     * Sets the scene-specific draw callback. Pass `null` to clear.
     * @param cb - The draw function to call each frame, or null.
     */
    public setDrawCallback(cb: (() => void) | null): void {
        this._drawCallback = cb;
    }

    /**
     * Renders one ImGui frame. Called from the engine's end-of-frame observable.
     * Skips entirely when the overlay is hidden.
     */
    public render(): void {
        if (!this._initialized || !this._visible) return;

        if (!this._loggedFirstRender) {
            console.log("[ImGui] First render call — drawing frame");
            this._loggedFirstRender = true;
        }

        // High-DPI strategy: set the canvas CSS size to physical pixels and
        // use CSS transform to scale it back to the viewport. This makes
        // clientWidth/clientHeight return physical pixel values, so jsimgui's
        // setDisplayProperties() sets DisplaySize to physical pixels naturally.
        // The canvas backing store also matches. Result: ImGui renders at
        // native resolution with correctly sized widgets.
        const dpr = window.devicePixelRatio || 1;
        const cssW = this._gameCanvas.clientWidth;
        const cssH = this._gameCanvas.clientHeight;
        const physW = Math.floor(cssW * dpr);
        const physH = Math.floor(cssH * dpr);

        // Set canvas CSS dimensions to physical pixels (makes clientWidth = physW)
        this._canvas.style.width = `${physW}px`;
        this._canvas.style.height = `${physH}px`;
        // Scale back down to fit the viewport via CSS transform
        this._canvas.style.transform = `scale(${1 / dpr})`;
        this._canvas.style.transformOrigin = "top left";

        if (this._canvas.width !== physW || this._canvas.height !== physH) {
            this._canvas.width = physW;
            this._canvas.height = physH;
        }

        const io = ImGui.GetIO();
        const style = ImGui.GetStyle();

        // Apply UI scale every frame via style.FontScaleMain
        style.FontScaleMain = this._uiScale[0];

        ImGuiImplWeb.BeginRender();

        // ─── Single tabbed window for all panels ─────────────
        ImGui.SetNextWindowSize({ x: 400, y: 0 }, ImGui.Cond.FirstUseEver);
        if (ImGui.Begin("Debug Panel")) {
            if (ImGui.BeginTabBar("DebugTabs")) {
                // Scene-specific tabs (Player, Bots, etc.)
                if (this._drawCallback) {
                    this._drawCallback();
                }

                // Settings tab (always available)
                if (ImGui.BeginTabItem("Settings")) {
                    if (ImGui.SliderFloat("UI Scale", this._uiScale, 0.5, 3.0, "%.1f")) {
                        localStorage.setItem("fps_imgui_scale", this._uiScale[0].toFixed(2));
                    }
                    ImGui.SameLine();
                    if (ImGui.Button("Reset")) {
                        this._uiScale[0] = 1.0;
                        localStorage.setItem("fps_imgui_scale", "1.00");
                    }
                    ImGui.EndTabItem();
                }

                ImGui.EndTabBar();
            }
        }
        ImGui.End();

        ImGuiImplWeb.EndRender();

        // Update input capture flags after the frame
        this._wantCaptureMouse = io.WantCaptureMouse;
        this._wantCaptureKeyboard = io.WantCaptureKeyboard;
    }

    /**
     * Cleans up the overlay canvas and ImGui resources.
     */
    public dispose(): void {
        for (const fn of this._cleanupFns) {
            fn();
        }
        this._cleanupFns = [];
        // Shut down the ImGui WebGL2 backend to release GPU resources
        if (this._initialized) {
            try {
                ImGuiImplOpenGL3.Shutdown();
                ImGui.DestroyContext();
            } catch (_) { /* ignore if already torn down */ }
        }
        if (this._canvas && this._canvas.parentElement) {
            this._canvas.parentElement.removeChild(this._canvas);
        }
        this._initialized = false;
        this._visible = false;
    }
}
