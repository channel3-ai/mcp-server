import { Channel3, Channel3Error } from "@channel3/sdk";

export type Channel3Client = Channel3;

export const CONVERSATION_ID_HEADER = "X-Conversation-Id";

export function createClient(apiKey: string, baseURL?: string, threadId?: string) {
	return new Channel3({
		apiKey,
		baseUrl: baseURL,
		...(threadId ? { headers: { [CONVERSATION_ID_HEADER]: threadId } } : {}),
	});
}

// The SDK's own message dumps the status and raw JSON body; swap in one the agent can act on.
export function withStatusMessages(err: unknown, messages: Record<number, string>): unknown {
	const message = err instanceof Channel3Error && err.statusCode && messages[err.statusCode];
	return message ? new Error(message) : err;
}
