import * as React from "react";

const CHANNEL_NAME = "channel3-storefront-instances";
const FALLBACK_KEY_DELAY_MS = 1000;

interface InstanceKey {
	orderKey: number;
	source: "server" | "client";
	instanceId: string;
}

interface ElectionMessage extends InstanceKey {
	type: "hello" | "born";
}

function isYounger(mine: InstanceKey, other: InstanceKey): boolean {
	if (other.source !== mine.source) {
		return false;
	}
	if (other.orderKey !== mine.orderKey) {
		return other.orderKey > mine.orderKey;
	}
	return other.instanceId > mine.instanceId;
}

export function useLiveInstance(orderKey: number | null, instanceId: string): boolean {
	const [superseded, setSuperseded] = React.useState(false);
	const [fallbackKey, setFallbackKey] = React.useState<number | null>(null);

	React.useEffect(() => {
		if (orderKey !== null) {
			return;
		}
		const timer = setTimeout(() => setFallbackKey(Date.now()), FALLBACK_KEY_DELAY_MS);
		return () => clearTimeout(timer);
	}, [orderKey]);

	const source = orderKey !== null ? "server" : "client";
	const effectiveKey = orderKey ?? fallbackKey;

	React.useEffect(() => {
		if (effectiveKey === null || typeof BroadcastChannel === "undefined") {
			return;
		}
		const mine: InstanceKey = { orderKey: effectiveKey, source, instanceId };
		const peers = new Map<string, InstanceKey>();
		const channel = new BroadcastChannel(CHANNEL_NAME);

		channel.onmessage = (event: MessageEvent<ElectionMessage>) => {
			const message = event.data;
			if (!message || message.instanceId === instanceId) {
				return;
			}
			if (message.type === "hello") {
				peers.clear();
				channel.postMessage({ type: "born", ...mine } satisfies ElectionMessage);
			}
			peers.set(message.instanceId, message);
			setSuperseded([...peers.values()].some((peer) => isYounger(mine, peer)));
		};
		channel.postMessage({ type: "hello", ...mine } satisfies ElectionMessage);

		return () => channel.close();
	}, [effectiveKey, source, instanceId]);

	return !superseded;
}
