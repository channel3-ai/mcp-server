import type { PriceHistory, ProductDetail } from "@channel3/sdk/resources";

export type ProductsPageResult = {
	products: ProductDetail[];
	next_page_token: string | null;
};

export type GetDetailsResult = {
	product: ProductDetail;
};

export type GetPriceHistoryResult = Pick<PriceHistory, "history" | "statistics">;
