import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Vite plugin to fix recast-detour's `this["Recast"]` assignment
 * which fails in strict ESM because `this` is undefined.
 * Replaces with `globalThis["Recast"]`.
 */
function recastDetourFix(): Plugin {
	return {
		name: "recast-detour-fix",
		transform(code, id) {
			if (id.includes("recast-detour")) {
				return code.replaceAll('this["Recast"]', 'globalThis["Recast"]');
			}
		},
	};
}

export default defineConfig({
	plugins: [tailwindcss(), recastDetourFix()],
	base: "./",
	server: {
		port: 3000,
	},
	optimizeDeps: {
		exclude: ["@babylonjs/havok", "recast-detour"],
	},
	build: {
		target: "esnext",
	},
});
