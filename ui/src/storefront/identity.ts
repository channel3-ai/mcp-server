import { getOrCreateId } from "@/storefront/storage";

const DEVICE_STORAGE_KEY = "channel3-storefront:device:v1";

let deviceId: string | null = null;

export function getDeviceId(): string {
	if (!deviceId) {
		deviceId = getOrCreateId(localStorage, DEVICE_STORAGE_KEY, () => crypto.randomUUID());
	}
	return deviceId;
}

let currentThreadId: string | null = null;

export function setThreadId(threadId: string): void {
	currentThreadId = threadId;
}

export function getThreadId(): string | null {
	return currentThreadId;
}
