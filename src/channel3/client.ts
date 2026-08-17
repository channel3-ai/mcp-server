import { Channel3 } from "@channel3/sdk";

export type Channel3Client = Channel3;

export function createClient(apiKey: string, baseURL?: string) {
	return new Channel3({ apiKey, baseUrl: baseURL });
}
