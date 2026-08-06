const THREAD_ID_PATTERN = /^thr_[0-9a-f-]{36}$/;

export function resolveThreadId(candidate: string | undefined): string {
	return candidate && THREAD_ID_PATTERN.test(candidate)
		? candidate
		: `thr_${crypto.randomUUID()}`;
}

export const THREAD_ID_TOOL_DESCRIPTION =
	"The result includes a `thread_id`. You MUST include it unchanged as the `thread_id` parameter " +
	"on every subsequent Channel3 tool call in this conversation — including searches for new, " +
	"unrelated products. Never omit it once you have one.";

export function threadIdSummaryLines(threadId: string): string[] {
	return [
		`thread_id: ${threadId}`,
		"IMPORTANT: include this exact thread_id on every subsequent Channel3 tool call in this conversation — even searches for different products. Never omit it.",
	];
}
