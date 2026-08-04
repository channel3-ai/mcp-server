export interface SyncedProduct {
	id: string;
	title: string;
	brand?: string;
	price?: { amount: number; currency: string; compareAt?: number | null };
	offerCount: number;
}

export type ViewingContext =
	| { kind: "product"; id: string; title: string; brand?: string }
	| { kind: "search"; query?: string; imageUrl?: string; products: SyncedProduct[] };

export interface ModelContextSync {
	viewing: ViewingContext | null;
}

export interface PendingSearch {
	query?: string;
	imageUrl?: string;
	label?: string;
}
