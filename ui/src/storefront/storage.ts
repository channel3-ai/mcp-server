export function readStored(storage: Storage, key: string): string | null {
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStored(storage: Storage, key: string, value: string): void {
	try {
		storage.setItem(key, value);
	} catch {}
}

export function getOrCreateId(storage: Storage, key: string, fallback: () => string): string {
	try {
		const existing = storage.getItem(key);
		if (existing) return existing;
		const created = crypto.randomUUID();
		storage.setItem(key, created);
		return created;
	} catch {
		return fallback();
	}
}
