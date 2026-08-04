import type { Bindings } from "./types";

function splitList(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseIpv4(ip: string): number | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		const octet = Number(part);
		if (!Number.isInteger(octet) || octet < 0 || octet > 255 || part !== String(octet)) {
			return null;
		}
		value = value * 256 + octet;
	}
	return value;
}

function ipInCidr(ip: string, cidr: string): boolean {
	const [base, bits] = cidr.split("/");
	const prefix = Number(bits);
	const address = parseIpv4(ip);
	const network = parseIpv4(base ?? "");
	if (address === null || network === null) return false;
	if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
	// JS shifts are mod-32, so `<< 32` would be a no-op rather than a zero mask.
	if (prefix === 0) return true;
	const mask = (0xffffffff << (32 - prefix)) >>> 0;
	return (address & mask) === (network & mask);
}

function certifiesHost(
	env: Bindings,
	cert: IncomingRequestCfProperties["tlsClientAuth"] | undefined,
): boolean {
	if (cert?.certVerified !== "SUCCESS" || cert.certRevoked === "1") return false;
	// All three DN formats, so config can name the CA by common name alone.
	const names = [cert.certIssuerDN, cert.certIssuerDNRFC2253, cert.certIssuerDNLegacy];
	return splitList(env.HOST_BYPASS_MTLS_ISSUERS).some((issuer) =>
		names.some((name) => name?.includes(issuer)),
	);
}

/** Hosts that meter their own users, so a per-IP limit would be communal. */
export function isVerifiedHost(env: Bindings, request: Request): boolean {
	const cf = request.cf as IncomingRequestCfProperties | undefined;
	const clientIP = request.headers.get("cf-connecting-ip") ?? "";
	return (
		splitList(env.HOST_BYPASS_CIDRS).some((cidr) => ipInCidr(clientIP, cidr)) ||
		certifiesHost(env, cf?.tlsClientAuth)
	);
}
