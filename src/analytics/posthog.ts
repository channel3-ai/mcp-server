import { waitUntil } from "cloudflare:workers";
import {
	type InitializeCaptureData,
	type McpCaptureCommon,
	PostHogMCP,
	type PostHogMCPOptions,
	type SessionTokenPayload,
	setLogger,
	type ToolCallCaptureData,
} from "@posthog/mcp";

import type { Bindings, Props } from "../types";

setLogger((msg) => {
	if (!msg.startsWith("Captured ")) console.warn(msg);
});

const PROPERTY_MAX_CHARS = 1000;

type BeforeSend = Exclude<PostHogMCPOptions["before_send"], undefined | unknown[]>;

const capMcpPayloads: BeforeSend = (event) => {
	if (!event?.properties) return event;
	for (const key of ["$mcp_response", "$mcp_parameters"]) {
		const value = event.properties[key];
		if (value === undefined) continue;
		const json = typeof value === "string" ? value : JSON.stringify(value);
		event.properties[key] =
			json.length > PROPERTY_MAX_CHARS
				? `${json.slice(0, PROPERTY_MAX_CHARS)}…[truncated]`
				: value;
	}
	return event;
};

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let sharedClient: { key: string; host?: string; client: PostHogMCP } | null = null;

function getSharedClient(env: Bindings): PostHogMCP | null {
	if (!env.POSTHOG_API_KEY) return null;
	const host = env.POSTHOG_HOST || undefined;
	if (sharedClient?.key !== env.POSTHOG_API_KEY || sharedClient.host !== host) {
		sharedClient = {
			key: env.POSTHOG_API_KEY,
			host,
			client: new PostHogMCP(env.POSTHOG_API_KEY, {
				host,
				flushAt: 1,
				flushInterval: 0,
				before_send: capMcpPayloads,
				waitUntil,
			}),
		};
	}
	return sharedClient.client;
}

export class Analytics {
	private session: Partial<SessionTokenPayload>;
	private client: PostHogMCP | null;
	private hashPromise: Promise<string> | null = null;

	constructor(
		env: Bindings,
		readonly props: Props,
		session: SessionTokenPayload | null,
	) {
		this.session = session ?? {};
		this.client = getSharedClient(env);
	}

	get sessionId(): string | undefined {
		return this.session.sessionId;
	}

	private hash(input: string): Promise<string> {
		this.hashPromise ??= sha256Hex(input);
		return this.hashPromise;
	}

	private async common(): Promise<McpCaptureCommon> {
		const ip = this.props.clientIP !== "unknown" ? this.props.clientIP : null;
		const userAgent = this.props.userAgent !== "unknown" ? this.props.userAgent : null;
		const free = this.props.isFreeTier;
		return {
			distinctId: free ? undefined : `key_${await this.hash(this.props.apiKey)}`,
			sessionId: this.session.sessionId,
			protocolVersion: this.session.protocolVersion,
			properties: {
				tier: free ? "free" : "api_key",
				...(ip ? { $ip: ip } : {}),
				...(userAgent ? { user_agent: userAgent } : {}),
				...(this.session.clientName ? { $mcp_client_name: this.session.clientName } : {}),
				...(this.session.clientVersion
					? { $mcp_client_version: this.session.clientVersion }
					: {}),
			},
		};
	}

	async captureToolCall(data: ToolCallCaptureData): Promise<void> {
		try {
			if (!this.client) return;
			const { properties, ...common } = await this.common();
			this.client.captureToolCall({
				...data,
				...common,
				properties: { ...data.properties, ...properties },
			});
		} catch (err) {
			console.warn("analytics capture failed", err);
		}
	}

	async captureEvent(
		event: string,
		properties: Record<string, unknown>,
		timestamp?: string,
	): Promise<void> {
		try {
			if (!this.client) return;
			const {
				properties: commonProperties,
				sessionId,
				protocolVersion,
				distinctId,
			} = await this.common();
			const deviceId =
				typeof properties.device_id === "string" ? properties.device_id : undefined;
			const at = timestamp ? new Date(timestamp) : undefined;
			this.client.capture({
				distinctId: distinctId ?? (deviceId ? `device_${deviceId}` : undefined),
				event,
				properties: {
					...properties,
					...commonProperties,
					...(sessionId ? { $session_id: sessionId } : {}),
					...(protocolVersion ? { $mcp_protocol_version: protocolVersion } : {}),
				},
				...(at && !Number.isNaN(at.getTime()) ? { timestamp: at } : {}),
			});
		} catch (err) {
			console.warn("analytics capture failed", err);
		}
	}

	async captureInitialize(data: InitializeCaptureData): Promise<void> {
		try {
			if (!this.client) return;
			const { properties, ...common } = await this.common();
			this.client.captureInitialize({
				...data,
				...common,
				properties: { ...data.properties, ...properties },
			});
		} catch (err) {
			console.warn("analytics capture failed", err);
		}
	}
}
