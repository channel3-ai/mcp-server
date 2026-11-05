import { Wakeshift } from "@wakeshift/sdk";

import type { Bindings } from "../types";
import { defineWatchEvents, type WatchEvents } from "./events";

export type WakeshiftApp = { wake: Wakeshift; events: WatchEvents };

let cached: { key: string; app: WakeshiftApp } | null = null;

// A Worker's secrets arrive with each request, so the client is made on the first one
// and kept, as Wakeshift's Cloudflare Workers guide does.
export function getWakeshift(env: Bindings): WakeshiftApp | null {
	const key = env.WAKESHIFT_KEY?.trim();
	if (!key) return null;
	if (cached?.key !== key) {
		const wake = new Wakeshift({ key, core: env.WAKESHIFT_CORE || undefined });
		cached = { key, app: { wake, events: defineWatchEvents(wake) } };
	}
	return cached.app;
}
