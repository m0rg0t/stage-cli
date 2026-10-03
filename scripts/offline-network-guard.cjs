// Verification-only preload. Fail closed before any non-loopback connection.
// NODE_OPTIONS propagates this guard to Node test and build workers.
const fs = require("node:fs");
const net = require("node:net");
const { syncBuiltinESMExports } = require("node:module");

if (process.env.STAGE_VERIFY_OFFLINE !== "true")
	throw new Error("Offline guard requires STAGE_VERIFY_OFFLINE=true");
const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function check(host) {
	if (!host || local.has(String(host).toLowerCase())) return;
	if (process.env.OFFLINE_NETWORK_LOG)
		fs.appendFileSync(process.env.OFFLINE_NETWORK_LOG, `${host}\n`);
	throw new Error(`Offline verification blocked outbound network to ${host}`);
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
	const options = Array.isArray(args[0]) ? args[0] : args;
	const first = options[0];
	if (first && typeof first === "object") {
		// Named pipes / Unix sockets are local IPC.
		if (!first.path) check(first.host ?? first.hostname);
	} else if (typeof first !== "string" || /^\d+$/.test(first)) {
		check(typeof options[1] === "string" ? options[1] : undefined);
	}
	return connect.apply(this, args);
};

if (globalThis.fetch) {
	const fetch = globalThis.fetch;
	globalThis.fetch = function (input, ...args) {
		try {
			check(
				new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname,
			);
		} catch (error) {
			return Promise.reject(error);
		}
		return fetch.call(this, input, ...args);
	};
}
syncBuiltinESMExports();
