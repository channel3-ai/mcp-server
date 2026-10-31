// A Workers-native client for Wakeshift's app HTTP API (https://wakeshift.ai/docs/http-api).
// @wakeshift/sdk's attach() is built on the v1 MCP SDK's McpServer internals, which this
// server's v2 McpServer doesn't have, so we speak the documented wire protocol directly.

export const DEFAULT_CORE = "https://app.wakeshift.ai";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const KEY_LENGTH = 50;
const KEY_LIMIT = 1n << 288n;
// PKCS #8 for an Ed25519 key, before its 32-byte seed (RFC 8410).
const PKCS8_PREFIX = hexToBytes("302e020100300506032b657004220420");
const TIMEOUT_MS = 20_000;

export class WakeshiftError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(`Wakeshift ${code || status}: ${message}`);
		this.name = "WakeshiftError";
		this.status = status;
		this.code = code;
	}
}

export function isWakeshiftCode(err: unknown, code: string): boolean {
	return err instanceof WakeshiftError && err.code === code;
}

type SigningKey = { privateKey: CryptoKey; kid: string };

export class WakeshiftClient {
	readonly core: string;
	private signing: Promise<SigningKey>;

	constructor(key: string, core?: string) {
		this.core = (core || DEFAULT_CORE).replace(/\/+$/, "");
		this.signing = importAppKey(key);
		// Surface a malformed key on first use, not as an unhandled rejection.
		this.signing.catch(() => undefined);
	}

	async request<T = Record<string, unknown>>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		body?: unknown,
	): Promise<T> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${await this.assertion()}`,
		};
		if (body !== undefined) headers["Content-Type"] = "application/json";
		let resp: Response;
		let text: string;
		try {
			resp = await fetch(`${this.core}/api/apps/v1${path}`, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			text = await resp.text();
		} catch (err) {
			throw new WakeshiftError(
				0,
				"unreachable",
				`can't reach ${this.core}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		let json: unknown;
		try {
			json = text ? JSON.parse(text) : undefined;
		} catch {
			json = undefined;
		}
		if (!resp.ok) {
			const e = (json as { error?: { code?: unknown; message?: unknown } } | undefined)
				?.error;
			throw new WakeshiftError(
				resp.status,
				typeof e?.code === "string" ? e.code : "",
				typeof e?.message === "string" ? e.message : text.slice(0, 200) || resp.statusText,
			);
		}
		if (!json || typeof json !== "object" || Array.isArray(json)) {
			throw new WakeshiftError(resp.status, "bad_response", "response was not a JSON object");
		}
		return json as T;
	}

	// A compact JWS (EdDSA, typ app+jwt) asserting the app's identity, living two minutes.
	private async assertion(): Promise<string> {
		const { privateKey, kid } = await this.signing;
		const iat = Math.floor(Date.now() / 1000);
		const claims = {
			iss: kid,
			sub: kid,
			aud: `${this.core}/api/apps`,
			iat,
			exp: iat + 120,
			jti: base64url(crypto.getRandomValues(new Uint8Array(16))),
		};
		const input = `${b64json({ alg: "EdDSA", typ: "app+jwt", kid })}.${b64json(claims)}`;
		const sig = await crypto.subtle.sign(
			{ name: "Ed25519" },
			privateKey,
			new TextEncoder().encode(input),
		);
		return `${input}.${base64url(new Uint8Array(sig))}`;
	}
}

// A key is wst_ + 50 base58 characters: a 32-byte Ed25519 seed followed by its CRC32.
export async function importAppKey(key: string): Promise<SigningKey> {
	const s = key.trim();
	if (!s.startsWith("wst_")) throw new Error("WAKESHIFT_KEY must start with wst_");
	const rest = s.slice(4);
	if (rest.length !== KEY_LENGTH || rest.includes("_")) {
		throw new Error("WAKESHIFT_KEY is not a wst_ key of 50 letters and digits");
	}
	let n = 0n;
	for (const ch of rest) {
		const d = BASE58.indexOf(ch);
		if (d < 0) throw new Error("WAKESHIFT_KEY is mistyped");
		n = n * 58n + BigInt(d);
	}
	if (n >= KEY_LIMIT) throw new Error("WAKESHIFT_KEY is mistyped");
	const bytes = hexToBytes(n.toString(16).padStart(72, "0"));
	const seed = bytes.slice(0, 32);
	const check = new DataView(bytes.buffer, bytes.byteOffset + 32, 4).getUint32(0);
	if (crc32(seed) !== check) throw new Error("WAKESHIFT_KEY is cut short or mistyped");

	const pkcs8 = new Uint8Array(PKCS8_PREFIX.length + seed.length);
	pkcs8.set(PKCS8_PREFIX);
	pkcs8.set(seed, PKCS8_PREFIX.length);
	const extractable = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, [
		"sign",
	]);
	const jwk = (await crypto.subtle.exportKey("jwk", extractable)) as JsonWebKey;
	if (!jwk.x) throw new Error("could not derive the Wakeshift public key");
	const publicKey = base64urlDecode(jwk.x);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", publicKey));
	const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, [
		"sign",
	]);
	return { privateKey, kid: base64url(digest.slice(0, 16)) };
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(b: Uint8Array): number {
	let c = 0xffffffff;
	for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export function base64url(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
	const b64 = s
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(s.length / 4) * 4, "=");
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64json(v: unknown): string {
	return base64url(new TextEncoder().encode(JSON.stringify(v)));
}
