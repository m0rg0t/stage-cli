import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
test("packed CLI ships its web UI, migrations and skills and works against a fresh database", () => {
	const temp = mkdtempSync(path.join(tmpdir(), "stage-package-"));
	try {
		execFileSync("tar", ["-xzf", path.join(root, "output/stagereview.tgz"), "-C", temp]);
		const packed = path.join(temp, "package");
		const manifest = JSON.parse(readFileSync(path.join(packed, "package.json"), "utf8"));
		assert.equal(manifest.bin.stagereview, "./dist/index.js");
		assert.ok(readFileSync(path.join(packed, "web-dist/index.html"), "utf8").includes("<html"));
		assert.ok(readFileSync(path.join(packed, "drizzle/meta/_journal.json"), "utf8"));
		assert.ok(readFileSync(path.join(packed, "README.md"), "utf8"));
		assert.ok(readdirSync(path.join(packed, "skills")).length > 0);
		assert.ok(!Object.keys(manifest.dependencies).some((name) => name.startsWith("@stagereview/")));
		// Use the workspace's locked runtime dependencies, but only the packed application files.
		for (const name of Object.keys(manifest.dependencies)) {
			const destination = path.join(packed, "node_modules", name);
			mkdirSync(path.dirname(destination), { recursive: true });
			symlinkSync(path.join(root, "packages/cli/node_modules", name), destination);
		}
		const repo = path.join(temp, "repo");
		const home = path.join(temp, "home");
		mkdirSync(repo);
		mkdirSync(home);
		const env = { ...process.env, HOME: home };
		execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repo, env });
		execFileSync(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"-c",
				"core.hooksPath=/dev/null",
				"commit",
				"--allow-empty",
				"--quiet",
				"-m",
				"fixture",
			],
			{ cwd: repo, env },
		);
		const run = (...args) =>
			execFileSync(process.execPath, [path.join(packed, manifest.bin.stagereview), ...args], {
				cwd: repo,
				env,
				encoding: "utf8",
			});
		assert.match(run("--help"), /Chapter-style code review/);
		assert.equal(run("--version").trim(), manifest.version);
		assert.deepEqual(JSON.parse(run("comments", "list", "--ref", "work", "--json")), []);
		run(
			"comments",
			"create",
			"--ref",
			"work",
			"--file",
			"fixture.ts",
			"--line",
			"1",
			"--body",
			"Synthetic package check",
		);
		const threads = JSON.parse(run("comments", "list", "--ref", "work", "--json"));
		assert.equal(threads.length, 1);
		assert.equal(threads[0].filePath, "fixture.ts");
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});
