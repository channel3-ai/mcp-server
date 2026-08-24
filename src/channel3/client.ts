import { Channel3 } from "@channel3/sdk";

export type Channel3Client = Channel3;

export const CONVERSATION_ID_HEADER = "X-Conversation-Id";

export function createClient(apiKey: string, baseURL?: string, threadId?: string) {
	return new Channel3({
		apiKey,
		baseUrl: baseURL,
		...(threadId ? { headers: { [CONVERSATION_ID_HEADER]: threadId } } : {}),
	});
}
