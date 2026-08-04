#!/usr/bin/env node

// Proves the deployed worker actually serves the UI bundle it was built with.
const target = process.argv[2] ?? process.env.SMOKE_URL ?? "https://mcp.trychannel3.com/";

function fail(reason) {
	console.error(`FAIL ${target} — ${reason}`);
	process.exit(1);
}

const response = await fetch(target, {
	method: "POST",
	headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
	body: JSON.stringify({
		jsonrpc: "2.0",
		id: 1,
		method: "resources/read",
		params: { uri: "ui://storefront/app.html" },
	}),
});
const body = await response.text();
if (!response.ok) fail(`HTTP ${response.status}: ${body.slice(0, 200)}`);

// Stateless transport answers either as plain JSON or a single SSE event.
const payload = body.startsWith("event:") ? (body.match(/^data: (.*)$/m)?.[1] ?? "") : body;
let html = "";
try {
	html = JSON.parse(payload).result?.contents?.[0]?.text ?? "";
} catch {
	fail(`unparseable response: ${body.slice(0, 200)}`);
}
if (!html.toLowerCase().startsWith("<!doctype html")) {
	fail(`no storefront UI in response: ${body.slice(0, 200)}`);
}

console.log(`ok ${target} — served ${Math.round(html.length / 1024)}KB storefront UI`);
