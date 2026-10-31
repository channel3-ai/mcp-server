import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createWatchSubscription } from "../channel3/subscriptions";
import { resolveThreadId, THREAD_ID_TOOL_DESCRIPTION, threadIdSummaryLines } from "../thread";
import type { ToolContext } from "../types";
import {
	subscribeAll,
	type WakeInputs,
	wakeInputs,
	wakeshiftUser,
	wireCall,
	withAddition,
} from "../wakeshift/call";
import type { WakeshiftClient } from "../wakeshift/client";
import {
	AVAILABILITY_EVENT,
	ensureManifest,
	fromArgValue,
	PRICE_EVENT,
	toArgValue,
	WAKE_EVENTS,
	type WakeEventName,
	watchArgs,
} from "../wakeshift/events";
import { runTool, type ToolCallResult } from "./helpers";

const NOTIFY_EVENTS = { price: PRICE_EVENT, availability: AVAILABILITY_EVENT } as const;

const threadIdParam = z
	.string()
	.optional()
	.describe("Conversation thread ID from the most recent Channel3 result, unchanged.");

const WatchProductSchema = z.object({
	product_id: z
		.string()
		.trim()
		.min(1)
		.describe("Channel3 product ID from a search_products or get_products result."),
	notify_on: z
		.array(z.enum(["price", "availability"]))
		.min(1)
		.default(["price", "availability"])
		.describe("What to be woken for: price changes, stock changes, or both (the default)."),
	domains: z
		.array(z.string().trim().min(1))
		.max(25)
		.optional()
		.describe(
			"Only these retailers' offers, as bare domains like nike.com. Omit for every retailer.",
		),
	selected_options: z
		.record(z.string(), z.string())
		.optional()
		.describe(
			'Pin to one variant as `{ optionName: label }`, e.g. `{ "Size": "M" }`, with every configurable option set. Omit to watch the product as a whole.',
		),
	thread_id: threadIdParam,
	...wakeInputs,
});

const ProductOnlySchema = z.object({
	product_id: z.string().trim().min(1).describe("Channel3 product ID being watched."),
	thread_id: threadIdParam,
});

const ListSchema = z.object({ thread_id: threadIdParam });

type ListedSubscription = {
	id: string;
	event: string;
	arguments?: Record<string, unknown>;
	created_at?: string;
};

async function listWatches(wake: WakeshiftClient, user: string) {
	const out = await wake.request<{ subscriptions?: ListedSubscription[] }>(
		"POST",
		"/event-subscriptions/list",
		{ user },
	);
	return (out.subscriptions ?? []).filter(
		(s): s is ListedSubscription & { arguments: { product: string } } =>
			(WAKE_EVENTS as readonly string[]).includes(s.event) &&
			typeof s.arguments?.product === "string",
	);
}

type RequestCtx = { mcpReq: { _meta?: Record<string, unknown> } };

export function registerWatchTools(server: McpServer, ctx: ToolContext, wake: WakeshiftClient) {
	server.registerTool(
		"watch_product",
		{
			title: "Watch Product",
			description:
				"Watch a product for price drops and restocks, and be woken when one happens — even after this " +
				"conversation goes idle. Use when the user asks to track a price, wait for a sale, or be told when " +
				"something is back in stock. Optionally limit to certain retailers or pin one variant (size, color). " +
				THREAD_ID_TOOL_DESCRIPTION,
			inputSchema: WatchProductSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (params, reqCtx: RequestCtx): Promise<ToolCallResult> => {
			const threadId = resolveThreadId(params.thread_id);
			const meta = reqCtx.mcpReq._meta;
			let addition: Parameters<typeof withAddition>[1] = {};
			const result = await runTool(
				"watch_product",
				ctx,
				params,
				async (p) => {
					const user = await wakeshiftUser(ctx, threadId);
					await ensureManifest(wake);
					const selection = p.selected_options
						? Object.entries(p.selected_options).map(([name, label]) => ({
								name,
								label,
							}))
						: undefined;
					const sub = await createWatchSubscription(ctx.env, {
						productId: p.product_id,
						domains: p.domains,
						selection,
					});
					const args = watchArgs(sub.product_id, sub.subscription_id);
					const events: WakeEventName[] = [...new Set(p.notify_on)].map(
						(n) => NOTIFY_EVENTS[n],
					);
					const what =
						p.notify_on.length === 2
							? "price and stock"
							: p.notify_on[0] === "price"
								? "price"
								: "stock";
					const scope = [
						sub.domains?.length ? `at ${sub.domains.join(", ")}` : "",
						selection?.length ? `(${selection.map((s) => s.label).join(", ")})` : "",
					]
						.filter(Boolean)
						.join(" ");
					const out = await subscribeAll(
						wake,
						(session) =>
							wireCall(ctx, meta, user, "watch_product", p as WakeInputs, session),
						events.map((event) => ({ event, arguments: args })),
						{
							reason: `Watching ${what} on Channel3 product ${sub.product_id}${scope ? ` ${scope}` : ""}`,
							label: sub.product_id,
						},
					);
					addition = out.addition;
					return {
						product_id: sub.product_id,
						notify_on: p.notify_on,
						domains: sub.domains ?? null,
						selection: selection ?? null,
						already_watching: out.subscriptions.every((s) => !s.created),
						thread_id: threadId,
					};
				},
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							`${r.already_watching ? "Already watching" : "Now watching"} ${r.notify_on.join(" and ")} changes on product ${r.product_id}` +
								`${r.domains ? ` at ${r.domains.join(", ")}` : ""}.`,
							"Channel3 re-checks watched products daily and wakes this conversation when a change is detected.",
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
			return withAddition(result, addition);
		},
	);

	server.registerTool(
		"unwatch_product",
		{
			title: "Unwatch Product",
			description:
				"Stop watching a product's price and stock (undoes watch_product). " +
				THREAD_ID_TOOL_DESCRIPTION,
			inputSchema: ProductOnlySchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (params): Promise<ToolCallResult> => {
			const threadId = resolveThreadId(params.thread_id);
			return runTool(
				"unwatch_product",
				ctx,
				params,
				async (p) => {
					const user = await wakeshiftUser(ctx, threadId);
					const product = toArgValue(p.product_id);
					const matches = (await listWatches(wake, user)).filter(
						(s) => s.arguments.product === product,
					);
					let ended = 0;
					for (const s of matches) {
						const r = await wake.request<{ ended?: boolean }>(
							"POST",
							"/event-subscriptions/end",
							{
								user,
								id: s.id,
							},
						);
						if (r.ended) ended++;
					}
					return { product_id: p.product_id, ended, thread_id: threadId };
				},
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							r.ended
								? `Stopped watching product ${r.product_id}.`
								: `Product ${r.product_id} wasn't being watched.`,
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
		},
	);

	server.registerTool(
		"list_watched_products",
		{
			title: "List Watched Products",
			description:
				"List the products being watched for price and stock changes. " +
				THREAD_ID_TOOL_DESCRIPTION,
			inputSchema: ListSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (params): Promise<ToolCallResult> => {
			const threadId = resolveThreadId(params.thread_id);
			return runTool(
				"list_watched_products",
				ctx,
				params,
				async () => {
					const user = await wakeshiftUser(ctx, threadId);
					const byProduct = new Map<string, Set<"price" | "availability">>();
					for (const s of await listWatches(wake, user)) {
						const id = fromArgValue(s.arguments.product);
						const set = byProduct.get(id) ?? new Set();
						set.add(s.event === PRICE_EVENT ? "price" : "availability");
						byProduct.set(id, set);
					}
					return {
						watches: [...byProduct].map(([product_id, kinds]) => ({
							product_id,
							notify_on: [...kinds].sort(),
						})),
						thread_id: threadId,
					};
				},
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							r.watches.length
								? r.watches
										.map((w) => `- ${w.product_id}: ${w.notify_on.join(", ")}`)
										.join("\n")
								: "No products are being watched.",
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
		},
	);
}
