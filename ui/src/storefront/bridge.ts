import type { Product } from "@channel3/sdk/resources";
import type { App } from "@modelcontextprotocol/ext-apps/react";
import {
	type GetDetailsResult,
	GetDetailsResultSchema,
	type GetPriceHistoryResult,
	GetPriceHistoryResultSchema,
	type ProductsPageResult,
	ProductsPageResultSchema,
} from "@shared/wire";
import type { z } from "zod";

import { getDeviceId, getThreadId } from "@/storefront/identity";

export interface BrowseInput {
	query?: string;
	imageUrl?: string;
	pageToken?: string;
}

export interface BrowsePage {
	products: Product[];
	nextPageToken: string | null;
}

export interface GetProductOptions {
	selectedOptions?: Record<string, string>;
}

export interface StorefrontBridge {
	browse(input: BrowseInput): Promise<BrowsePage>;
	getSimilar(productId: string, limit: number): Promise<Product[]>;
	getProduct(productId: string, options?: GetProductOptions): Promise<Product>;
	getPriceHistory(productId: string): Promise<GetPriceHistoryResult>;
	openLink(url: string): Promise<void>;
	requestFullscreen(): Promise<boolean>;
	requestInline(): Promise<void>;
	sendChatMessage(text: string): Promise<void>;
	syncContext(text: string): void;
}

type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;

export function toolErrorText(content: readonly { type: string }[] | undefined): string | null {
	const block = content?.find((b) => b.type === "text");
	return block && "text" in block && typeof block.text === "string" ? block.text : null;
}

function structuredContent<T>(result: ToolResult, tool: string, schema: z.ZodType): T {
	if (result.isError) {
		throw new Error(`${tool} failed: ${toolErrorText(result.content) ?? "unknown error"}`);
	}
	const parsed = schema.safeParse(result.structuredContent);
	if (!parsed.success) {
		throw new Error(`${tool} returned an unexpected result: ${parsed.error.message}`);
	}
	return parsed.data as T;
}

function identityArgs(): { thread_id?: string; device_id: string } {
	const threadId = getThreadId();
	return {
		...(threadId ? { thread_id: threadId } : {}),
		device_id: getDeviceId(),
	};
}

export class AppBridge implements StorefrontBridge {
	private lastContextPayload: string | null = null;
	private warnedNoModelContext = false;

	constructor(private readonly app: App) {}

	async browse(input: BrowseInput): Promise<BrowsePage> {
		const result = await this.app.callServerTool({
			name: "browse_products",
			arguments: {
				query: input.query || undefined,
				image_url: input.imageUrl,
				page_token: input.pageToken,
				...identityArgs(),
			},
		});
		const page = structuredContent<ProductsPageResult>(
			result,
			"browse_products",
			ProductsPageResultSchema,
		);
		return { products: page.products, nextPageToken: page.next_page_token };
	}

	async getSimilar(productId: string, limit: number): Promise<Product[]> {
		const result = await this.app.callServerTool({
			name: "get_similar",
			arguments: { product_id: productId, limit, ...identityArgs() },
		});
		return structuredContent<ProductsPageResult>(
			result,
			"get_similar",
			ProductsPageResultSchema,
		).products;
	}

	async getProduct(productId: string, options?: GetProductOptions): Promise<Product> {
		const result = await this.app.callServerTool({
			name: "get_details",
			arguments: {
				product_id: productId,
				...(options?.selectedOptions ? { selected_options: options.selectedOptions } : {}),
				...identityArgs(),
			},
		});
		return structuredContent<GetDetailsResult>(result, "get_details", GetDetailsResultSchema)
			.product;
	}

	async getPriceHistory(productId: string): Promise<GetPriceHistoryResult> {
		const result = await this.app.callServerTool({
			name: "get_price_history",
			arguments: { product_id: productId, ...identityArgs() },
		});
		const parsed = structuredContent<z.infer<typeof GetPriceHistoryResultSchema>>(
			result,
			"get_price_history",
			GetPriceHistoryResultSchema,
		);
		return {
			canonical_product_id: parsed.canonical_product_id,
			history: parsed.history.map((point) => ({
				...point,
				timestamp: new Date(point.timestamp),
			})),
			statistics: parsed.statistics,
		};
	}

	async openLink(url: string): Promise<void> {
		await this.app.openLink({ url });
	}

	async requestFullscreen(): Promise<boolean> {
		const available = this.app.getHostContext()?.availableDisplayModes ?? [];
		if (!available.includes("fullscreen")) {
			return false;
		}
		const result = await this.app.requestDisplayMode({ mode: "fullscreen" });
		return result.mode === "fullscreen";
	}

	async requestInline(): Promise<void> {
		const available = this.app.getHostContext()?.availableDisplayModes ?? [];
		if (!available.includes("inline")) {
			return;
		}
		await this.app.requestDisplayMode({ mode: "inline" });
	}

	async sendChatMessage(text: string): Promise<void> {
		await this.app.sendMessage({ role: "user", content: [{ type: "text", text }] });
	}

	syncContext(text: string): void {
		const capabilities = this.app.getHostCapabilities()?.updateModelContext;
		if (!capabilities) {
			if (!this.warnedNoModelContext) {
				this.warnedNoModelContext = true;
				console.warn(
					"host does not support ui/update-model-context; the model will not know what the shopper is looking at",
				);
			}
			return;
		}
		if (text === this.lastContextPayload) {
			return;
		}
		this.lastContextPayload = text;
		this.app
			.updateModelContext({ content: [{ type: "text", text }] })
			.catch((error: unknown) => {
				this.lastContextPayload = null;
				console.error("model context sync failed", error);
			});
	}
}
