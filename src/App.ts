/**
 * Application entry point. Initializes the GameManager and loads the initial scene.
 * @module App
 */

import "@babylonjs/core";
import "@babylonjs/loaders/glTF";

import { GameManager } from "./client/core/GameManager";
import { MainMenuScene } from "./client/scenes/MainMenuScene";

import "./style.css";

/**
 * Top-level application class. Creates the GameManager singleton
 * and loads the match scene.
 */
export class App {
    private _gameManager: GameManager | null = null;

    /**
     * Initializes the engine, loads Havok, and loads the main menu scene.
     */
    public async init(): Promise<void> {
        const canvas = document.getElementById("canvas") as HTMLCanvasElement;
        if (!canvas) {
            throw new Error("Canvas element not found");
        }

        this._gameManager = await GameManager.initialize(canvas);
        await this._gameManager.loadScene(MainMenuScene);
    }

    /**
     * Disposes the game manager and all resources.
     */
    public dispose(): void {
        this._gameManager?.dispose();
    }
}
