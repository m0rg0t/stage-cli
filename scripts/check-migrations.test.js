import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-migrations.js", import.meta.url));
let root;
const env = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_AUTHOR_NAME: "Fixture",
	GIT_AUTHOR_EMAIL: "fixture@example.invalid",
	GIT_COMMITTER_NAME: "Fixture",
	GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};
function git(...args) {
	return execFileSync("git", args, { cwd: root, env });
}
function write(relative, contents = "-- migration\n") {
	writeFileSync(path.join(root, relative), contents);
}
function check() {
	return spawnSync(process.execPath, [script], { cwd: root, env, encoding: "utf8" });
}
beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), "stage-migrations-"));
	mkdirSync(path.join(root, "packages/cli/drizzle"), { recursive: true });
	git("init", "--quiet");
	write("packages/cli/drizzle/0000.sql");
	write(".gitignore", "*.ignored\n");
	git("add", ".");
	git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("accepts unchanged migrations", () => {
	assert.equal(check().status, 0);
});
test("rejects tracked migration changes", () => {
	write("packages/cli/drizzle/0000.sql", "-- changed\n");
	assert.equal(check().status, 1);
});
test("rejects untracked generated migrations", () => {
	write("packages/cli/drizzle/0001 new.sql");
	assert.equal(check().status, 1);
});
test("rejects staged generated migrations", () => {
	write("packages/cli/drizzle/0001.sql");
	git("add", "packages/cli/drizzle/0001.sql");
	assert.equal(check().status, 1);
});
test("rejects deleted migrations", () => {
	rmSync(path.join(root, "packages/cli/drizzle/0000.sql"));
	assert.equal(check().status, 1);
});
test("ignores unrelated changes and ignored scratch files", () => {
	write("unrelated.txt");
	write("packages/cli/drizzle/scratch.ignored");
	assert.equal(check().status, 0);
});

test("rejects ignored generated SQL migrations", () => {
	write(".gitignore", "*.sql\n");
	write("packages/cli/drizzle/0001.sql");
	assert.equal(check().status, 1);
});
test("rejects ignored migration metadata even when the directory is ignored", () => {
	write(".gitignore", "packages/cli/drizzle/meta/\n");
	mkdirSync(path.join(root, "packages/cli/drizzle/meta"));
	write("packages/cli/drizzle/meta/0001_snapshot.json", "{}");
	assert.equal(check().status, 1);
});
test("ignores unrelated ignored SQL outside the migration directory", () => {
	write(".gitignore", "*.sql\n");
	write("scratch.sql");
	assert.equal(check().status, 0);
});
