import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
	plugins: [react(), tailwindcss(), viteSingleFile()],
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
			"@shared": path.resolve(import.meta.dirname, "../shared"),
		},
	},
	build: {
		outDir: "../public/storefront",
		emptyOutDir: true,
		rollupOptions: {
			input: path.resolve(import.meta.dirname, "app.html"),
		},
	},
});
