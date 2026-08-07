export interface SavedEntry {
	id: string;
	title: string;
	brands?: string[];
	imageUrl?: string;
	savedAt: number;
}

export const SAVED_CAP = 40;

const SAVED_KEY = "channel3-storefront:saved:v1";

const CHANGED_EVENT = "channel3-storefront:saved-changed";

export interface SavedChange {
	type: "added" | "removed";
	id: string;
}

const EMPTY: SavedEntry[] = [];

function isSavedEntry(value: unknown): value is SavedEntry {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const entry = value as Record<string, unknown>;
	return typeof entry.id === "string" && typeof entry.title === "string";
}

export function readSaved(): SavedEntry[] {
	try {
		const raw = localStorage.getItem(SAVED_KEY);
		if (!raw) {
			return EMPTY;
		}
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return EMPTY;
		}
		return parsed.filter(isSavedEntry).slice(0, SAVED_CAP);
	} catch {
		return EMPTY;
	}
}

function writeSaved(entries: SavedEntry[], change: SavedChange): void {
	try {
		localStorage.setItem(SAVED_KEY, JSON.stringify(entries));
	} catch (error) {
		console.warn("saved products: failed to persist to localStorage", error);
		return;
	}
	window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: change }));
}

export function removeSaved(id: string): SavedEntry | null {
	const entries = readSaved();
	const entry = entries.find((existing) => existing.id === id);
	if (!entry) {
		return null;
	}
	writeSaved(
		entries.filter((existing) => existing.id !== id),
		{ type: "removed", id },
	);
	return entry;
}

export function toggleSaved(entry: Omit<SavedEntry, "savedAt">): SavedChange | null {
	const entries = readSaved();
	if (entries.some((existing) => existing.id === entry.id)) {
		removeSaved(entry.id);
		return { type: "removed", id: entry.id };
	}
	if (entries.length >= SAVED_CAP) {
		return null;
	}
	writeSaved([{ ...entry, savedAt: Date.now() }, ...entries], { type: "added", id: entry.id });
	return { type: "added", id: entry.id };
}

export function subscribeSaved(callback: (change?: SavedChange) => void): () => void {
	const onStorage = (event: StorageEvent) => {
		if (event.key === null || event.key === SAVED_KEY) {
			callback();
		}
	};
	const onChanged = (event: Event) => {
		callback((event as CustomEvent<SavedChange>).detail ?? undefined);
	};
	window.addEventListener("storage", onStorage);
	window.addEventListener(CHANGED_EVENT, onChanged);
	return () => {
		window.removeEventListener("storage", onStorage);
		window.removeEventListener(CHANGED_EVENT, onChanged);
	};
}
