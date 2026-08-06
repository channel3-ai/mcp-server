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

function writeSaved(entries: SavedEntry[]): void {
	try {
		localStorage.setItem(SAVED_KEY, JSON.stringify(entries));
	} catch (error) {
		console.warn("saved products: failed to persist to localStorage", error);
		return;
	}
	window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export function toggleSaved(entry: Omit<SavedEntry, "savedAt">): void {
	const entries = readSaved();
	if (entries.some((existing) => existing.id === entry.id)) {
		writeSaved(entries.filter((existing) => existing.id !== entry.id));
		return;
	}
	if (entries.length >= SAVED_CAP) {
		return;
	}
	writeSaved([{ ...entry, savedAt: Date.now() }, ...entries]);
}

export function subscribeSaved(callback: () => void): () => void {
	const onStorage = (event: StorageEvent) => {
		if (event.key === null || event.key === SAVED_KEY) {
			callback();
		}
	};
	window.addEventListener("storage", onStorage);
	window.addEventListener(CHANGED_EVENT, callback);
	return () => {
		window.removeEventListener("storage", onStorage);
		window.removeEventListener(CHANGED_EVENT, callback);
	};
}
