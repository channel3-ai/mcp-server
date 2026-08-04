#!/usr/bin/env node

// Rate limiting lives at the Cloudflare edge, which wrangler does not manage; this keeps
// the rule in git so its exemptions cannot drift from the worker's auth handling.
import { readFile } from "node:fs/promises";

const ZONE_ID = "db47370b88403a171142175e28e98f52";
const RULESET_ID = "18b89293b60b425881ecb75bf6146e94";
const RULE_ID = "371f3ad95bd542ba8d829d680a39056f";

// Wrangler's OAuth login only carries zone:read, so this needs its own token.
async function readToken() {
	const fromEnv = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_AUTH_TOKEN;
	if (fromEnv) return fromEnv;
	const devVars = await readFile(new URL("../../.dev.vars", import.meta.url), "utf8").catch(
		() => "",
	);
	return devVars.match(/^\s*(?:CLOUDFLARE_API_TOKEN|CF_AUTH_TOKEN)\s*=\s*"?([^"\n]+)"?/m)?.[1];
}

const token = await readToken();
if (!token) {
	console.error(
		"No Cloudflare API token found. Set CLOUDFLARE_API_TOKEN, or add it to .dev.vars (gitignored).\n" +
			"Create one at https://dash.cloudflare.com/profile/api-tokens > Create Token > Create Custom Token,\n" +
			"with the Zone group permission 'Zone WAF' set to Edit, scoped to the trychannel3.com zone.",
	);
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
