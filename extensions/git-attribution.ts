/**
 * pi-git-attribution — disclose AI-assisted commits.
 *
 * Appends a trailer (default `Assisted-by: <you>`) to `git commit` calls issued by
 * the agent's bash tool. Commits you type yourself in a terminal and `!` shell
 * escapes are never touched. No git config or git hook is modified; removing the
 * package (or disabling it in `pi config`) fully reverts the behavior.
 *
 * Configuration: see src/config.ts. Configure with `/attribution` or by editing
 * `<agent-dir>/git-attribution.json` (global) or `<repo>/.pi/git-attribution.json`.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir, isToolCallEventType } from "@earendil-works/pi-coding-agent";

import { resolveConfig, renderTrailer, writePatch, type ResolvedConfig } from "../src/config.js";

/** `git commit`, also matching `git -C <path> commit` and `git -c k=v commit`. Never `commit-tree`. */
const COMMIT = /\bgit\b((?:\s+-(?:C|c)\s+\S+)*\s+commit)(?![\w-])/;

/** Commands that reuse an existing commit body, where the trailer may already be present. */
const REUSES_MESSAGE = /(?:--no-edit\b|--reuse-message\b|\s-C\s)/;

export default function (pi: ExtensionAPI) {
	pi.registerFlag("assisted-by", {
		description: "Trailer value for agent-made commits (overrides git-attribution.json)",
		type: "string",
		default: "",
	});

	const context = (ctx: ExtensionContext) => ({
		agentDir: getAgentDir(),
		cwd: ctx.cwd,
		configDirName: CONFIG_DIR_NAME,
		projectTrusted: ctx.isProjectTrusted(),
	});

	const resolve = (ctx: ExtensionContext): ResolvedConfig => {
		const flag = pi.getFlag("assisted-by");
		return resolveConfig({ ...context(ctx), flagValue: typeof flag === "string" ? flag : undefined });
	};

	const active = (resolved: ResolvedConfig) =>
		resolved.config.enabled && !resolved.optedOut && !resolved.envDisabled && renderTrailer(resolved.config) !== "";

	pi.on("session_start", (_event, ctx) => {
		const resolved = resolve(ctx);
		if (active(resolved)) return;
		if (resolved.config.enabled && !resolved.optedOut && !resolved.envDisabled) {
			ctx.ui.notify("git-attribution: no trailer value set — run /attribution <value>", "warning");
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;

		const command = event.input.command;
		if (!COMMIT.test(command)) return;
		if (command.includes("--trailer")) return;

		const resolved = resolve(ctx);
		if (!active(resolved)) return;
		const trailer = renderTrailer(resolved.config);

		// `--amend --no-edit` / `-C <commit>` keep an existing body: skip if already attributed.
		if (REUSES_MESSAGE.test(command)) {
			const { stdout, code } = await pi.exec("git", ["log", "-1", "--format=%B"], { cwd: ctx.cwd });
			if (code === 0 && stdout.includes(trailer)) return;
		}

		event.input.command = command.replace(COMMIT, (match) => `${match} --trailer ${JSON.stringify(trailer)}`);
	});

	pi.registerCommand("attribution", {
		description: "Show or change the AI-assisted commit trailer",
		handler: async (args, ctx) => {
			const resolved = resolve(ctx);
			const words = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const project = words[0] === "-l" || words[0] === "--local";
			if (project) words.shift();

			const target = project ? resolved.projectFile : resolved.globalFile;
			const scope = project ? "project" : "global";

			if (words.length === 0) {
				const state = !resolved.config.enabled
					? `disabled (${resolved.sources.enabled})`
					: resolved.envDisabled
						? "disabled (PI_GIT_ATTRIBUTION=0)"
						: resolved.optedOut
							? `disabled (.pi/no-attribution)`
							: renderTrailer(resolved.config) || "not configured";
				ctx.ui.notify(`git-attribution: ${state} · global=${resolved.globalFile}`, "info");
				return;
			}

			if (words[0] === "on" && words.length === 1) {
				writePatch(target, { enabled: true });
				ctx.ui.notify(`git-attribution: enabled (${scope})`, "info");
				return;
			}
			if (words[0] === "off" && words.length === 1) {
				writePatch(target, { enabled: false });
				ctx.ui.notify(`git-attribution: disabled (${scope})`, "info");
				return;
			}

			if (words[0] === "key") {
				const key = words[1];
				if (!key) {
					ctx.ui.notify("git-attribution: usage — /attribution key <Trailer-Token>", "warning");
					return;
				}
				writePatch(target, { key });
				ctx.ui.notify(`git-attribution: trailer token → ${key.replace(/:+$/, "")} (${scope})`, "info");
				return;
			}

			const value = words.join(" ");
			writePatch(target, { value, enabled: true });
			ctx.ui.notify(`git-attribution: ${renderTrailer({ ...resolved.config, value })} (${scope})`, "info");
		},
	});
}
