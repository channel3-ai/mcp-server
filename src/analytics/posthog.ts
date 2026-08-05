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

setLogger((msg) => console.warn(msg));

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
				: json;
	}
	return event;
};

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
		this.client = env.POSTHOG_API_KEY
			? new PostHogMCP(env.POSTHOG_API_KEY, {
					host: env.POSTHOG_HOST || undefined,
					flushAt: 1,
					flushInterval: 0,
					before_send: capMcpPayloads,
					waitUntil,
				})
			: null;
	}

	private hash(input: string): Promise<string> {
		this.hashPromise ??= sha256Hex(input);
		return this.hashPromise;
	}

	private async common(): Promise<McpCaptureCommon> {
		const ip = this.props.clientIP !== "unknown" ? this.props.clientIP : null;
		const free = this.props.isFreeTier;
		return {
			distinctId: free ? undefined : `key_${await this.hash(this.props.apiKey)}`,
			sessionId: this.session.sessionId,
			protocolVersion: this.session.protocolVersion,
			properties: {
				tier: free ? "free" : "api_key",
				...(ip ? { $ip: ip } : {}),
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
