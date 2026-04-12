import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		restoreMocks: true,
		exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
	},
});
