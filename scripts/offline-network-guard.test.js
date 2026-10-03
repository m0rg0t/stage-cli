import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./offline-network-guard.cjs", import.meta.url));
for (const [name, source] of [
	["fetch", 'await assert.rejects(fetch("https://example.invalid"), /blocked outbound/);'],
	[
		"TCP",
		'assert.throws(() => net.connect({ host: "example.invalid", port: 443 }), /blocked outbound/);',
	],
]) {
	test(`blocks non-loopback ${name} before connecting`, () => {
		const temp = mkdtempSync(path.join(tmpdir(), "stage-network-"));
		try {
			const log = path.join(temp, "blocked.log");
			const result = spawnSync(
				process.execPath,
				[
					"--require",
					guard,
					"--input-type=module",
					"-e",
					`import assert from "node:assert/strict"; import net from "node:net"; ${source}`,
				],
				{
					env: { ...process.env, STAGE_VERIFY_OFFLINE: "true", OFFLINE_NETWORK_LOG: log },
					encoding: "utf8",
				},
			);
			assert.equal(result.status, 0, result.stderr);
			assert.equal(readFileSync(log, "utf8"), "example.invalid\n");
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
}
