export interface SyncedProduct {
	id: string;
	title: string;
	brand?: string;
	price?: { amount: number; currency: string; compareAt?: number | null };
	offerCount: number;
}

export interface PriceFocusStats {
	currency: string;
	currentPrice: number;
	minPrice: number;
	maxPrice: number;
	mean: number;
	status: "low" | "typical" | "high";
}

export interface OfferFocusSummary {
	count: number;
	inStock: number;
	/** Retailer domains, cheapest first. */
	domains: string[];
}

export type ViewingContext =
	| {
			kind: "product";
			id: string;
			title: string;
			brands: string[];
			price?: { amount: number; currency: string; compareAt?: number | null };
			/** True when this product is one the model already saw in its tool result. */
			inTranscript: boolean;
			/** Set when the shopper selected a variant that resolves to a different product. */
			variantTitle?: string;
			priceStats?: PriceFocusStats;
			description?: string;
			keyFeatures?: string[];
			attributes?: { label: string; value: string }[];
			offers?: OfferFocusSummary;
	  }
	| { kind: "search"; query?: string; imageUrl?: string; products: SyncedProduct[] };

export interface OrderKey {
	asOf: number;
	seq: number;
}

export function compareOrderKeys(a: OrderKey | null, b: OrderKey | null): number {
	return (a?.asOf ?? 0) - (b?.asOf ?? 0) || (a?.seq ?? 0) - (b?.seq ?? 0);
}

export interface PendingSearch {
	query?: string;
	imageUrl?: string;
	label?: string;
}
