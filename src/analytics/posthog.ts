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

function asId(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function deviceDistinctId(deviceId: string): string {
	return `device_${deviceId}`;
}

function threadDistinctId(threadId: string): string {
	return `thread_${threadId}`;
}

function identityFrom(
	properties: Record<string, unknown>,
	parameters?: unknown,
): { deviceId?: string; threadId?: string } {
	const params =
		parameters && typeof parameters === "object"
			? (parameters as Record<string, unknown>)
			: undefined;
	return {
		deviceId: asId(properties.device_id) ?? asId(params?.device_id),
		threadId: asId(properties.thread_id) ?? asId(params?.thread_id),
	};
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

	private freeDistinctId(deviceId?: string, threadId?: string): string | undefined {
		if (deviceId) return deviceDistinctId(deviceId);
		if (threadId) return threadDistinctId(threadId);
		return undefined;
	}

	private aliasThreadToDevice(deviceId: string, threadId: string): void {
		this.client?.alias({
			distinctId: deviceDistinctId(deviceId),
			alias: threadDistinctId(threadId),
		});
	}

	async captureToolCall(data: ToolCallCaptureData): Promise<void> {
		try {
			if (!this.client) return;
			const { properties, ...common } = await this.common();
			const merged = { ...data.properties, ...properties };
			const { deviceId, threadId } = identityFrom(merged, data.parameters);
			if (!common.distinctId && deviceId && threadId) {
				this.aliasThreadToDevice(deviceId, threadId);
			}
			this.client.captureToolCall({
				...data,
				...common,
				distinctId: common.distinctId ?? this.freeDistinctId(deviceId, threadId),
				properties: {
					...merged,
					...(threadId ? { thread_id: threadId } : {}),
					...(deviceId ? { device_id: deviceId } : {}),
				},
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
			const { deviceId, threadId } = identityFrom(properties);
			if (!distinctId && deviceId && threadId) {
				this.aliasThreadToDevice(deviceId, threadId);
			}
			const at = timestamp ? new Date(timestamp) : undefined;
			this.client.capture({
				distinctId: distinctId ?? this.freeDistinctId(deviceId, threadId),
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
