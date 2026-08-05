import type { ProductDetail } from "@channel3/sdk/resources";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import * as React from "react";

import type { StorefrontBridge } from "@/storefront/bridge";
import { detailQueryOptions } from "@/storefront/detail-query";
import { toSyncedProduct, toSyncedProductStub } from "@/storefront/model-copy";
import {
	readSaved,
	SAVED_CAP,
	type SavedEntry,
	subscribeSaved,
	toggleSaved,
} from "@/storefront/saved-store";
import type { SyncedProduct } from "@/storefront/types";

type SavedItemStatus = "pending" | "ready" | "unavailable";

export interface SavedItem {
	entry: SavedEntry;
	product: ProductDetail | null;
	status: SavedItemStatus;
}

export function useSavedProducts(bridge: StorefrontBridge, hydrate: boolean) {
	const [entries, setEntries] = React.useState<SavedEntry[]>(() => readSaved());

	React.useEffect(() => subscribeSaved(() => setEntries(readSaved())), []);

	const items = useQueries({
		queries: entries.map((entry) => ({
			...detailQueryOptions(bridge, entry.id),
			enabled: hydrate,
		})),
		combine: React.useCallback(
			(results: UseQueryResult<ProductDetail>[]): SavedItem[] =>
				entries.map((entry, index) => {
					const query = results[index];
					if (query?.data) {
						return { entry, product: query.data, status: "ready" };
					}
					if (query?.isError) {
						return { entry, product: null, status: "unavailable" };
					}
					return { entry, product: null, status: "pending" };
				}),
			[entries],
		),
	});

	const toggle = React.useCallback((product: ProductDetail) => {
		const brands = (product.brands ?? []).map((brand) => brand.name);
		toggleSaved({
			id: product.id,
			title: product.title,
			brands: brands.length > 0 ? brands : undefined,
			imageUrl: product.images?.[0]?.url,
		});
	}, []);

	const isSaved = React.useCallback(
		(id: string) => entries.some((entry) => entry.id === id),
		[entries],
	);

	const syncedSaved = React.useMemo<SyncedProduct[]>(
		() =>
			items.map((item) =>
				item.product
					? toSyncedProduct(item.product)
					: toSyncedProductStub({
							id: item.entry.id,
							title: item.entry.title,
							brand: item.entry.brands?.[0],
						}),
			),
		[items],
	);

	return {
		items,
		count: entries.length,
		canSave: entries.length < SAVED_CAP,
		toggle,
		isSaved,
		syncedSaved,
	};
}

export type SavedProducts = ReturnType<typeof useSavedProducts>;
