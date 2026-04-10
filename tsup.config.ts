import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
	entry: ["src/bin/agno-os.ts"],
	format: ["esm"],
	target: "node20",
	clean: true,
	splitting: false,
	banner: {
		js: "#!/usr/bin/env node",
	},
	define: {
		"process.env.CLI_VERSION": JSON.stringify(pkg.version),
	},
});
