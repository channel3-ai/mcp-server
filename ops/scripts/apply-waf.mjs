#!/usr/bin/env node

// Rate limiting lives at the Cloudflare edge, which wrangler does not manage; this keeps
// the rule in git so its exemptions cannot drift from the worker's auth handling.
import { readFile } from "node:fs/promises";

const ZONE_ID = "db47370b88403a171142175e28e98f52";
const RULESET_ID = "18b89293b60b425881ecb75bf6146e94";
const RULE_ID = "371f3ad95bd542ba8d829d680a39056f";

const token = process.env.CF_AUTH_TOKEN;
if (!token) {
	console.error("CF_AUTH_TOKEN is not set. Create a token with Zone > Zone WAF > Edit.");
	process.exit(1);
}

const rule = JSON.parse(
	await readFile(new URL("../config/rate-limit.json", import.meta.url), "utf8"),
);

if (process.argv.includes("--dry-run")) {
	console.log(rule.expression);
	console.log(
		`\n${rule.ratelimit.requests_per_period} requests / ${rule.ratelimit.period}s per ${rule.ratelimit.characteristics.join(", ")}, ` +
			`${rule.action} for ${rule.ratelimit.mitigation_timeout}s`,
	);
	process.exit(0);
}

const response = await fetch(
	`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/rulesets/${RULESET_ID}/rules/${RULE_ID}`,
	{
		method: "PATCH",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify(rule),
	},
);
const result = await response.json();

if (!response.ok || !result.success) {
	console.error(`FAIL HTTP ${response.status}`);
	console.error(JSON.stringify(result.errors ?? result, null, 2));
	process.exit(1);
}

const applied = result.result?.rules?.find((r) => r.id === RULE_ID);
console.log(`ok applied "${applied?.description}" (version ${result.result?.version})`);
