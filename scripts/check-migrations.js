import { execFileSync } from "node:child_process";

const changes = execFileSync(
	"git",
	["status", "--porcelain=v1", "--untracked-files=all", "--", "packages/cli/drizzle/"],
	{ encoding: "utf8" },
);

const ignoredMigrations = execFileSync(
	"git",
	[
		"ls-files",
		"--others",
		"--ignored",
		"--exclude-standard",
		"--",
		":(glob)packages/cli/drizzle/**/*.sql",
		":(glob)packages/cli/drizzle/meta/**/*.json",
	],
	{ encoding: "utf8" },
);

if (changes.length > 0 || ignoredMigrations.length > 0) {
	console.error("Drizzle migrations are out of date. Run 'pnpm db:generate' and commit.");
	process.stderr.write(changes + ignoredMigrations);
	process.exitCode = 1;
}
