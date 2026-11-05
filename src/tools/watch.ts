import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createWatchSubscription } from "../channel3/subscriptions";
import { resolveThreadId, THREAD_ID_TOOL_DESCRIPTION, threadIdSummaryLines } from "../thread";
import type { ToolContext } from "../types";
import type { WakeshiftApp } from "../wakeshift";
import { watchArgs } from "../wakeshift/events";
import { runTool } from "./helpers";

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
		.describe(
			"What to be told about: price changes, availability (stock changes, and retailers starting or stopping selling it), or both (the default).",
		),
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
			'The variant to watch as `{ optionName: label }`, e.g. `{ "Color": "Navy", "Size": "M" }`. Required when the product has options. Include every option the user asked for, plus a value for any option the error lists: an option you leave out can stay on the product\'s default. Leave this out only for a product without options.',
		),
	thread_id: threadIdParam,
});

const UnwatchProductSchema = z.object({
	watch_id: z
		.string()
		.trim()
		.min(1)
		.describe("The watch_id from watch_product or from an alert."),
	thread_id: threadIdParam,
});

export function registerWatchTools(server: McpServer, ctx: ToolContext, app: WakeshiftApp) {
	// Our tools create the Channel3 subscription that makes a watch fire, so the generic
	// subscribe_events stays off. Without sign-in, list_subscriptions could only ever
	// fail, and unwatch_product covers stopping a watch.
	const attached = app.wake.attach(server, { tools: [] });
	const { price, availability } = app.events;

	server.registerTool(
		"watch_product",
		{
			title: "Watch Product",
			description:
				"Watch a product's price and stock, and be told in this chat when either changes, even while " +
				"this conversation is idle. Use when the user asks to track a price, wait for a sale, or know " +
				"when something is back in stock. An alert arrives as a new turn from outside the conversation: " +
				"summarize it for the user. Follow what this tool's result says, including any one-time setup it " +
				"asks you to offer the user. " +
				THREAD_ID_TOOL_DESCRIPTION,
			inputSchema: attached.inputs(WatchProductSchema),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		attached.events("watch_product", async (params, call) => {
			const threadId = resolveThreadId(params.thread_id);
			return runTool(
				"watch_product",
				ctx,
				params,
				async (p) => {
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
					const args = watchArgs(sub.subscription_id);
					const pinned =
						sub.selection?.map(({ name, label }) => ({ name, label })) ?? null;
					const notifyOn = [...new Set(p.notify_on)];
					const scope = [
						sub.domains?.length ? ` at ${sub.domains.join(", ")}` : "",
						pinned ? ` (${pinned.map((s) => s.label).join(", ")})` : "",
					].join("");
					const reason = `Watching ${notifyOn.join(" and ")} on Channel3 product ${sub.product_id}${scope}`;
					const created: boolean[] = [];
					for (const kind of notifyOn) {
						const event = kind === "price" ? price : availability;
						const s = await call.subscribe(event, args, {
							reason,
							label: sub.product_id,
						});
						created.push(s.created);
					}
					return {
						watch_id: sub.subscription_id,
						product_id: sub.product_id,
						notify_on: notifyOn,
						domains: sub.domains ?? null,
						selection: pinned,
						already_watching: !created.some(Boolean),
						thread_id: threadId,
					};
				},
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							`${r.already_watching ? "Already watching" : "Now watching"} ${r.notify_on.join(" and ")} on product ${r.product_id}` +
								`${r.selection ? ` (${r.selection.map((s) => s.label).join(", ")})` : ""}` +
								`${r.domains ? ` at ${r.domains.join(", ")}` : ""}.`,
							`watch_id: ${r.watch_id}`,
							...(r.selection
								? [
										`Variant: ${r.selection.map((s) => `${s.name} ${s.label}`).join(", ")}. If that isn't what the user asked for, call watch_product again with the right selected_options and unwatch this one.`,
									]
								: []),
							"Channel3 re-checks watched products daily, and you'll be told here when a change is detected.",
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
		}),
	);

	server.registerTool(
		"unwatch_product",
		{
			title: "Unwatch Product",
			description:
				"Stop a watch made with watch_product in this conversation. Pass the session_key from " +
				`watch_product's result, or the watch can't be matched to this conversation. ${THREAD_ID_TOOL_DESCRIPTION}`,
			inputSchema: attached.inputs(UnwatchProductSchema),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		attached.events("unwatch_product", async (params, call) => {
			const threadId = resolveThreadId(params.thread_id);
			return runTool(
				"unwatch_product",
				ctx,
				params,
				async (p) => {
					const args = watchArgs(p.watch_id);
					const ended = [
						await call.unsubscribe(price, args),
						await call.unsubscribe(availability, args),
					].some(Boolean);
					// Without a session_key, Wakeshift may not know which conversation this is, and
					// "not ended" would wrongly read as "wasn't watching" while alerts keep coming.
					if (!ended && !call.session) {
						throw new Error(
							"Couldn't tell which conversation this is, so the watch may still be active. Call unwatch_product again with the session_key from watch_product's result.",
						);
					}
					return { watch_id: p.watch_id, ended, thread_id: threadId };
				},
				{
					trackProperties: { thread_id: threadId },
					summarize: (r) =>
						[
							r.ended
								? "Stopped this watch."
								: "This conversation wasn't running that watch.",
							"",
							...threadIdSummaryLines(threadId),
						].join("\n"),
				},
			);
		}),
	);
}
