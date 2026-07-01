import Channel3 from "@channel3/sdk";

export type Channel3Client = Channel3;
export type ProductDetail = Channel3.ProductDetail;
export type ProductOffer = Channel3.ProductOffer;
export type SearchConfig = Channel3.SearchConfig;

export function createClient(apiKey: string, baseURL?: string) {
	return new Channel3({ apiKey, baseURL });
}
