import { z } from "zod";

import type { ToolCallResult } from "../tools/helpers";
import type { ToolContext } from "../types";
import type { WakeshiftClient } from "./client";
import type { WakeEventName } from "./events";

// The arguments @wakeshift/sdk's attached.inputs() adds to a subscribing tool, with its
// wording, so an agent identifies its conversation the same way it does for any Wakeshift app.
export const wakeInputs = {
	session_key: z
		.string()
		.optional()
		.describe(
			"This conversation's session_key, from an earlier result (a secret token, or a handle such as claude-code#2). Keep it to this conversation; don't share or log it.",
		),
	harness: z
		.string()
		.optional()
		.describe(
			"The program you're running in: codex, claude-code, cursor (local CLI or IDE), cursor-cloud (Cursor cloud agent), grok-bot, copilot-cli, opencode, antigravity, openclaw (even when it runs your turns in Codex), hermes, chatgpt, or your program's name if it isn't listed",
		),
	conversation_id: z
		.string()
		.optional()
		.describe(
			"Your own ID for this conversation, if your program gives you one. Cursor and Grok Bot: the output of `printenv CURSOR_CONVERSATION_ID`. Codex and Antigravity send it automatically; others leave it empty",
		),
};

export type WakeInputs = { session_key?: string; harness?: string; conversation_id?: string };

type RequestMeta = Record<string, unknown> | undefined;

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Wakeshift's user: our own opaque ID, never the raw credential. With an API key it's
// stable across conversations; on the free tier there's no sign-in, so it's the thread.
export async function wakeshiftUser(ctx: ToolContext, threadId: string): Promise<string> {
	if (!ctx.props.isFreeTier) {
		return `key_${(await sha256Hex(`wakeshift:key:${ctx.props.apiKey}`)).slice(0, 32)}`;
	}
	return `thr_${(await sha256Hex(`wakeshift:thread:${threadId}`)).slice(0, 32)}`;
}

function clientName(meta: RequestMeta, ctx: ToolContext): string {
	const info = meta?.["io.modelcontextprotocol/clientInfo"] as { name?: unknown } | undefined;
	const name = typeof info?.name === "string" ? info.name : ctx.analytics.clientName;
	return (name ?? "").slice(0, 200);
}

// The tool call as Wakeshift takes it (packCall in @wakeshift/sdk): empty fields left out.
export function wireCall(
	ctx: ToolContext,
	meta: RequestMeta,
	user: string,
	tool: string,
	args: WakeInputs,
	session?: string,
): Record<string, unknown> {
	const out: Record<string, unknown> = { client: clientName(meta, ctx), user, tool };
	if (meta && Object.keys(meta).length > 0) out.meta = meta;
	const sess = session ?? args.session_key;
	if (sess) out.session = sess;
	if (ctx.props.userAgent && ctx.props.userAgent !== "unknown")
		out.user_agent = ctx.props.userAgent;
	if (args.harness?.trim()) out.harness = args.harness.trim();
	if (args.conversation_id?.trim()) out.conversation = args.conversation_id.trim();
	return out;
}

type SubscribeResponse = {
	event_subscription: { id: string; created?: boolean };
	session: string;
	pending?: string;
};

type Addition = { text?: string; trailer?: string; meta?: Record<string, unknown> };

export type Subscription = { event: WakeEventName; id: string; created: boolean };

// Subscribes one tool call to several events, then asks once for what to add to the
// result (the defer_addition flow in https://wakeshift.ai/docs/http-api). If any step
// fails, the subscriptions this call created are rolled back.
export async function subscribeAll(
	client: WakeshiftClient,
	call: (session?: string) => Record<string, unknown>,
	subs: { event: WakeEventName; arguments: Record<string, string> }[],
	opts: { reason?: string; label?: string },
): Promise<{ subscriptions: Subscription[]; addition: Addition }> {
	let pending: string | undefined;
	let session: string | undefined;
	const created: { event: WakeEventName; arguments: Record<string, string>; session: string }[] =
		[];
	const subscriptions: Subscription[] = [];
	try {
		for (const s of subs) {
			const out = await client.request<SubscribeResponse>("POST", "/event-subscriptions", {
				call: call(session),
				name: s.event,
				arguments: s.arguments,
				defer_addition: true,
				...(pending ? { pending } : {}),
				...(opts.reason ? { reason: opts.reason.slice(0, 200) } : {}),
				...(opts.label ? { label: opts.label } : {}),
			});
			if (out.pending) pending = out.pending;
			session = out.session;
			const isNew = Boolean(out.event_subscription.created);
			if (isNew) created.push({ ...s, session: out.session });
			subscriptions.push({ event: s.event, id: out.event_subscription.id, created: isNew });
		}
		const addition = await client.request<Addition>("POST", "/calls/addition", {
			call: call(session),
			...(pending ? { pending } : {}),
		});
		return { subscriptions, addition };
	} catch (err) {
		for (const c of created) {
			await client
				.request("POST", "/event-subscriptions/unsubscribe", {
					call: call(c.session),
					name: c.event,
					arguments: c.arguments,
					reason: "rolled_back",
					...(pending ? { pending } : {}),
				})
				.catch((rollbackErr) =>
					console.error("wakeshift rollback failed", c.event, String(rollbackErr)),
				);
		}
		throw err;
	}
}

// Adds Wakeshift's text (how this conversation gets woken) to a tool result, in content
// and in structuredContent.wakeshift for hosts that show the model only structured output.
export function withAddition(result: ToolCallResult, addition: Addition): ToolCallResult {
	if (result.isError) return result;
	const out: ToolCallResult = { ...result, content: [...result.content] };
	const text = addition.text?.trim();
	if (text) out.content.push({ type: "text", text });
	if (addition.trailer) out.content.push({ type: "text", text: addition.trailer });
	if (addition.meta && Object.keys(addition.meta).length > 0) {
		out._meta = { ...((out._meta as Record<string, unknown>) ?? {}), ...addition.meta };
	}
	if (text && out.structuredContent) {
		out.structuredContent = { ...out.structuredContent, wakeshift: text };
	}
	return out;
}
