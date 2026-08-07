import type { ProductDetail } from "@channel3/sdk/resources";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import * as React from "react";

import { pickImage } from "@/registry/default/lib/format";
import { trackEvent } from "@/storefront/analytics";
import type { StorefrontBridge } from "@/storefront/bridge";
import { detailQueryOptions } from "@/storefront/detail-query";
import { toSyncedProduct, toSyncedProductStub } from "@/storefront/model-copy";
import {
	readSaved,
	removeSaved,
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
	const [lastAdded, setLastAdded] = React.useState<{ id: string; at: number } | null>(null);

	React.useEffect(
		() =>
			subscribeSaved((change) => {
				const next = readSaved();
				setEntries((prev) =>
					prev.length === next.length &&
					prev.every(
						(entry, index) =>
							entry.id === next[index].id && entry.savedAt === next[index].savedAt,
					)
						? prev
						: next,
				);
				if (change?.type === "added") {
					setLastAdded({ id: change.id, at: Date.now() });
				}
			}),
		[],
	);

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
		const change = toggleSaved({
			id: product.id,
			title: product.title,
			brands: brands.length > 0 ? brands : undefined,
			imageUrl: pickImage(product.images, { preferCleaned: true })?.url,
		});
		if (change) {
			trackEvent(change.type === "added" ? "saved_added" : "saved_removed", {
				product_id: product.id,
				title: product.title,
				brand: brands[0],
			});
		}
	}, []);

	const remove = React.useCallback((id: string) => {
		const entry = removeSaved(id);
		if (entry) {
			trackEvent("saved_removed", {
				product_id: id,
				title: entry.title,
				brand: entry.brands?.[0],
			});
		}
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
		lastAdded,
		toggle,
		remove,
		isSaved,
		syncedSaved,
	};
}

export type SavedProducts = ReturnType<typeof useSavedProducts>;
