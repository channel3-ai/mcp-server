import type { Bindings } from "../types";
import { WakeshiftClient } from "./client";

let cached: { key: string; core: string; client: WakeshiftClient } | null = null;

// One client per isolate: importing the signing key is the expensive part.
export function getWakeshift(env: Bindings): WakeshiftClient | null {
	const key = env.WAKESHIFT_KEY?.trim();
	if (!key) return null;
	const core = env.WAKESHIFT_CORE || "";
	if (!cached || cached.key !== key || cached.core !== core) {
		cached = { key, core, client: new WakeshiftClient(key, core || undefined) };
	}
	return cached.client;
}
