import type { OfferAvailabilityStatus, Price, ProductOffer } from "@channel3/sdk/resources";

const IN_STOCK: ReadonlySet<OfferAvailabilityStatus> = new Set<OfferAvailabilityStatus>([
	"InStock",
]);

export function isInStock(status: OfferAvailabilityStatus): boolean {
	return IN_STOCK.has(status);
}

export function leadOffer<T extends Pick<ProductOffer, "availability" | "price">>(
	offers: ReadonlyArray<T> | null | undefined,
): T | undefined {
	if (!offers || offers.length === 0) {
		return undefined;
	}
	const byPrice = [...offers].sort((a, b) => a.price.price - b.price.price);
	return byPrice.find((offer) => isInStock(offer.availability)) ?? byPrice[0];
}

const formatters = new Map<string, Intl.NumberFormat | null>();

export function currencyFormatter(
	currency: string,
	locale?: string,
	options?: Intl.NumberFormatOptions,
): Intl.NumberFormat | null {
	const key = `${locale ?? ""} ${currency} ${JSON.stringify(options ?? null)}`;
	let formatter = formatters.get(key);
	if (formatter === undefined) {
		try {
			formatter = new Intl.NumberFormat(locale, { style: "currency", currency, ...options });
		} catch {
			formatter = null;
		}
		formatters.set(key, formatter);
	}
	return formatter;
}

export function formatCurrency(amount: number, currency: string, locale?: string): string {
	return (
		currencyFormatter(currency, locale)?.format(amount) ?? `${currency} ${amount.toFixed(2)}`
	);
}

export function formatPrice(price: Price, locale?: string): string {
	return formatCurrency(price.price, price.currency, locale);
}
