import type { ProductDetail } from "@channel3/sdk/resources";
import { formatCurrency, leadOffer } from "@shared/format";

import type { PresenceRecord, ResultSetPresence } from "@/storefront/instance-presence";
import type {
	OfferFocusSummary,
	PriceFocusStats,
	SyncedProduct,
	ViewingContext,
} from "@/storefront/types";

type SyncSource = Pick<ProductDetail, "id" | "title" | "brands" | "offers">;

export function toSyncedProduct(product: SyncSource): SyncedProduct {
	const best = leadOffer(product.offers);
	return {
		id: product.id,
		title: product.title,
		brand: product.brands?.[0]?.name,
		price: best
			? {
					amount: best.price.price,
					currency: best.price.currency,
					compareAt: best.price.compare_at_price,
				}
			: undefined,
		offerCount: product.offers?.length ?? 0,
	};
}

const MAX_RESULT_SETS = 4;

function attributeLabel(handle: string): string {
	return handle.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function offerSummary(product: ProductDetail): OfferFocusSummary | undefined {
	const offers = product.offers ?? [];
	if (offers.length === 0) {
		return undefined;
	}
	const sorted = [...offers].sort((a, b) => a.price.price - b.price.price);
	return {
		count: offers.length,
		inStock: offers.filter((o) => o.availability === "InStock").length,
		domains: [...new Set(sorted.map((o) => o.domain))],
	};
}

/**
 * Project the full product the shopper is looking at down to what the model needs. The
 * widget holds the untruncated record; the model gets the substance (description, key
 * features, attributes, the offer spread) so it can answer without a round-trip.
 */
export function toFocusContext(
	product: ProductDetail,
	options: { inTranscript: boolean; variantTitle?: string; priceStats?: PriceFocusStats },
): Extract<ViewingContext, { kind: "product" }> {
	const description = product.description?.trim();
	const attributes = Object.entries(product.structured_attributes ?? {})
		.filter(([, values]) => values.length > 0)
		.map(([handle, values]) => ({ label: attributeLabel(handle), value: values.join(", ") }));
	return {
		kind: "product",
		id: product.id,
		title: product.title,
		brands: (product.brands ?? []).map((b) => b.name),
		price: toSyncedProduct(product).price,
		inTranscript: options.inTranscript,
		variantTitle: options.variantTitle,
		priceStats: options.priceStats,
		description: description || undefined,
		keyFeatures: product.key_features ?? undefined,
		attributes: attributes.length > 0 ? attributes : undefined,
		offers: offerSummary(product),
	};
}

const DEICTIC_PREFIX =
	'This is the shopper\'s live view of the storefront. When they say "this", "it", ' +
	'"the one I\'m viewing", or otherwise point at something without naming it, resolve it ';

function deicticHint(hasFocus: boolean): string {
	return hasFocus
		? `${DEICTIC_PREFIX}to the focused product below — do not ask them which product they mean.`
		: `${DEICTIC_PREFIX}from the view below rather than asking which product they mean; ask only if the view genuinely doesn't identify it.`;
}

function focusLines(viewing: ViewingContext): string[] {
	if (viewing.kind !== "product") {
		return [];
	}
	const price = viewing.price
		? ` — ${formatCurrency(viewing.price.amount, viewing.price.currency)}${
				viewing.price.compareAt && viewing.price.compareAt > viewing.price.amount
					? ` (was ${formatCurrency(viewing.price.compareAt, viewing.price.currency)})`
					: ""
			}`
		: "";
	const brand = viewing.brands.length > 0 ? ` (${viewing.brands.join(", ")})` : "";
	const lines = [
		`Focused on the product page for "${viewing.title}"${brand}${price} [id: ${viewing.id}].`,
	];
	if (viewing.inTranscript) {
		lines.push("Its full data is already in the search result above.");
	}
	if (viewing.variantTitle && viewing.variantTitle !== viewing.title) {
		lines.push(`Selected variant resolves to "${viewing.variantTitle}".`);
	}
	if (viewing.priceStats) {
		const s = viewing.priceStats;
		lines.push(
			`30-day price: now ${formatCurrency(s.currentPrice, s.currency)} (range ${formatCurrency(s.minPrice, s.currency)}–${formatCurrency(s.maxPrice, s.currency)}, typical ≈ ${formatCurrency(s.mean, s.currency)}); currently ${s.status}.`,
		);
	}
	if (viewing.offers) {
		const o = viewing.offers;
		lines.push(
			`${o.count} offer${o.count === 1 ? "" : "s"} (${o.inStock} in stock) — ${o.domains.join(", ")}.`,
		);
	}
	if (viewing.description) {
		lines.push(`Description: ${viewing.description}`);
	}
	if (viewing.keyFeatures?.length) {
		lines.push(`Key features: ${viewing.keyFeatures.join("; ")}.`);
	}
	if (viewing.attributes?.length) {
		lines.push(
			`Attributes: ${viewing.attributes.map((a) => `${a.label}: ${a.value}`).join("; ")}.`,
		);
	}
	return lines;
}

function resultSetLabel(set: ResultSetPresence): string {
	return set.query ? `"${set.query}"` : set.imageUrl ? "image search" : "products";
}

/**
 * Build the single shared model-context report from this instance's own state plus the
 * presence of every sibling. Reference the transcript instead of re-listing it; spend the
 * budget on the focused view and on state nothing else can supply.
 *
 * The YAML frontmatter header follows the convention used by the official ext-apps
 * examples (pdf-server, map-server, transcript-server), which the hosts' own prompting is
 * tuned against. The deictic hint is what makes "what is this?" resolvable without a
 * clarifying question — hosts deliver this report at wildly different times, and some
 * (Claude) make the model fetch it on demand rather than injecting it.
 */
export function buildContextReport(self: PresenceRecord, peers: PresenceRecord[]): string {
	const all = [self, ...peers].filter((r) => r.resultSets.length > 0 || r.focus);
	const byRecency = [...all].sort(
		(a, b) =>
			(b.activatedAt ?? 0) - (a.activatedAt ?? 0) || (b.orderKey ?? 0) - (a.orderKey ?? 0),
	);
	const shown = byRecency.flatMap((record) => record.resultSets).slice(0, MAX_RESULT_SETS);

	const lines: string[] = [];
	if (shown.length > 0) {
		lines.push(
			shown.length === 1
				? "The shopper has 1 result set open:"
				: `The shopper has ${shown.length} result sets open:`,
		);
		shown.forEach((rs, index) => {
			const transcriptNote =
				rs.transcriptCount > 0
					? ` (first ${rs.transcriptCount} in the search result above)`
					: "";
			const display = rs.display === "fullscreen" ? "fullscreen grid" : "inline";
			lines.push(
				`${index + 1}. ${resultSetLabel(rs)} — ${rs.loadedCount} loaded${transcriptNote}, ${display}`,
			);
		});
		lines.push("");
	}

	// The primary focus is wherever the shopper last interacted (byRecency[0]), which is
	// not necessarily the publishing instance — a PDP open in a sibling widget must not
	// vanish from the report just because another instance holds the publish slot.
	const productFocuses = byRecency
		.map((record) => record.focus)
		.filter((f): f is Extract<ViewingContext, { kind: "product" }> => f?.kind === "product")
		.filter((f, index, arr) => arr.findIndex((o) => o.id === f.id) === index);
	const primaryFocus = productFocuses[0] ?? null;
	if (primaryFocus) {
		lines.push(...focusLines(primaryFocus));
		lines.push(
			"The shopper can see all of this on their screen — reference it, don't recite it back. Answer from what's here; call get_products only for a detail this doesn't cover.",
		);
		for (const also of productFocuses.slice(1, 3)) {
			const brand = also.brands.length > 0 ? ` (${also.brands.join(", ")})` : "";
			lines.push(
				`Also open on screen: the product page for "${also.title}"${brand} [id: ${also.id}].`,
			);
		}
		lines.push("");
	}

	const delta: { id: string; title: string }[] = [];
	for (const set of byRecency.flatMap((record) => record.resultSets)) {
		for (const p of set.delta) {
			if (!delta.some((d) => d.id === p.id)) {
				delta.push(p);
			}
		}
	}
	if (delta.length > 0) {
		lines.push("Loaded by scrolling beyond the search results above:");
		delta.forEach((p, index) => {
			lines.push(`${index + 1}. "${p.title}" [id: ${p.id}]`);
		});
		lines.push("");
	}

	if (lines.length === 0) {
		lines.push("The shopper has the storefront open with no products in view.");
	}

	const hint = deicticHint(primaryFocus !== null);
	const header = [
		"---",
		"app: channel3-storefront",
		`result-sets: ${shown.length}`,
		`focused-product: ${primaryFocus ? primaryFocus.id : "none"}`,
		"---",
		"",
		hint,
		"",
	];

	return [...header, ...lines].join("\n").trimEnd();
}
