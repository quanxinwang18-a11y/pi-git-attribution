/**
 * Configuration for pi-git-attribution.
 *
 * Resolution order (later wins):
 *   1. built-in defaults
 *   2. `<agent-dir>/git-attribution.json`        global
 *   3. `<cwd>/.pi/git-attribution.json`          project (trusted projects only)
 *   4. `--assisted-by <value>` CLI flag           value only
 *
 * Disabling, in order of precedence: `PI_GIT_ATTRIBUTION=0`, `"enabled": false`,
 * or the `.pi/no-attribution` marker file in the repository.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const CONFIG_FILE = "git-attribution.json";

/** Creating this file in a repository's `.pi` directory disables attribution there. */
export const OPT_OUT_FILE = "no-attribution";

export interface Config {
	enabled: boolean;
	/** Trailer token, for example `Assisted-by`. */
	key: string;
	/** Trailer value, for example `qxwang6-pi`. Empty means "not configured yet". */
	value: string;
}

export type ConfigPatch = Partial<Config>;

/**
 * `value` defaults to empty on purpose: an installed package must never sign
 * commits on someone else's behalf. Configure it with `/attribution <value>`.
 */
export const DEFAULTS: Config = { enabled: true, key: "Assisted-by", value: "" };

export interface ResolvedConfig {
	config: Config;
	/** Which layer supplied each field, for `/attribution` output. */
	sources: { enabled: string; key: string; value: string };
	globalFile: string;
	projectFile: string;
	/** True when the repository opts out via `.pi/no-attribution`. */
	optedOut: boolean;
	/** True when `PI_GIT_ATTRIBUTION=0`. */
	envDisabled: boolean;
}

function parsePatch(raw: unknown): ConfigPatch | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const object = raw as Record<string, unknown>;
	const patch: ConfigPatch = {};
	if (typeof object.enabled === "boolean") patch.enabled = object.enabled;
	if (typeof object.key === "string" && object.key.trim()) {
		// Tolerate users writing "Assisted-by:" with the colon included.
		patch.key = object.key.trim().replace(/:+$/, "");
	}
	if (typeof object.value === "string") patch.value = object.value.trim();
	return patch;
}

/** Read one config file. Returns null when missing, unreadable, or malformed. */
export function readPatch(file: string): ConfigPatch | null {
	if (!existsSync(file)) return null;
	try {
		return parsePatch(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return null;
	}
}

/** Merge a patch into an existing config file, creating it when needed. */
export function writePatch(file: string, patch: ConfigPatch): void {
	const merged = { ...DEFAULTS, ...(readPatch(file) ?? {}), ...patch };
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

/** Walk up from `cwd` to the repository root and look for the opt-out marker. */
function hasOptOutMarker(cwd: string, configDirName: string): boolean {
	if (existsSync(join(cwd, configDirName, OPT_OUT_FILE))) return true;
	for (let dir = cwd; ; ) {
		if (existsSync(join(dir, ".git"))) return existsSync(join(dir, configDirName, OPT_OUT_FILE));
		const parent = dirname(dir);
		if (parent === dir) return false;
		dir = parent;
	}
}

export function resolveConfig(options: {
	agentDir: string;
	cwd: string;
	configDirName: string;
	projectTrusted: boolean;
	flagValue?: string;
}): ResolvedConfig {
	const globalFile = join(options.agentDir, CONFIG_FILE);
	const projectFile = join(options.cwd, options.configDirName, CONFIG_FILE);
	const config: Config = { ...DEFAULTS };
	const sources = { enabled: "default", key: "default", value: "default" };

	const global = readPatch(globalFile);
	if (global) {
		if (global.enabled !== undefined) {
			config.enabled = global.enabled;
			sources.enabled = globalFile;
		}
		if (global.key !== undefined) {
			config.key = global.key;
			sources.key = globalFile;
		}
		if (global.value !== undefined) {
			config.value = global.value;
			sources.value = globalFile;
		}
	}

	// Project config is only honored for trusted projects.
	const project = options.projectTrusted ? readPatch(projectFile) : null;
	if (project) {
		if (project.enabled !== undefined) {
			config.enabled = project.enabled;
			sources.enabled = projectFile;
		}
		if (project.key !== undefined) {
			config.key = project.key;
			sources.key = projectFile;
		}
		if (project.value !== undefined) {
			config.value = project.value;
			sources.value = projectFile;
		}
	}

	if (options.flagValue) {
		config.value = options.flagValue.trim();
		sources.value = "--assisted-by";
	}

	return {
		config,
		sources,
		globalFile,
		projectFile,
		optedOut: hasOptOutMarker(options.cwd, options.configDirName),
		envDisabled: process.env.PI_GIT_ATTRIBUTION === "0",
	};
}

/** Render the trailer line, or "" when attribution is not configured. */
export function renderTrailer(config: Config): string {
	const value = config.value.trim();
	if (!value) return "";
	return `${config.key || DEFAULTS.key}: ${value}`;
}
