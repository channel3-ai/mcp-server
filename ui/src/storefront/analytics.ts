import { MCP_SESSION_HEADER } from "@shared/wire";

import { getDeviceId, getThreadId } from "@/storefront/identity";
import { readStored, writeStored } from "@/storefront/storage";

function sessionScoped(key: string) {
	let cached: string | null = null;
	return {
		set(value: string): void {
			cached = value;
			writeStored(sessionStorage, key, value);
		},
		get(): string | null {
			return cached ?? readStored(sessionStorage, key);
		},
	};
}

const serverOrigin = sessionScoped("channel3-storefront:analytics-origin");
const analyticsSession = sessionScoped("channel3-storefront:analytics-session");

export function setAnalyticsTarget(origin?: string, sessionId?: string): void {
	if (origin) serverOrigin.set(origin);
	if (sessionId) analyticsSession.set(sessionId);
}

export function trackEvent(event: string, properties: Record<string, unknown> = {}): void {
	const origin = serverOrigin.get();
	if (!origin) return;
	const id = analyticsSession.get();
	const threadId = getThreadId();
	void fetch(`${origin}/analytics/events`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(id ? { [MCP_SESSION_HEADER]: id } : {}),
		},
		body: JSON.stringify({
			events: [
				{
					event,
					properties: {
						...properties,
						...(threadId ? { thread_id: threadId } : {}),
						device_id: getDeviceId(),
					},
					timestamp: new Date().toISOString(),
				},
			],
		}),
		keepalive: true,
	}).catch(() => {});
}
