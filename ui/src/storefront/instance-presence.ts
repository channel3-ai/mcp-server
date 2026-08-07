import { createLeaderElection, BroadcastChannel as ElectionChannel } from "broadcast-channel";
import * as React from "react";

import { getOrCreateId } from "@/storefront/storage";
import type { OrderKey, SyncedProduct, ViewingContext } from "@/storefront/types";

const SCOPE_STORAGE_KEY = "channel3-storefront:presence-scope";

// ui.domain makes the origin span conversations; a per-tab key (sessionStorage) keeps presence inside one chat.
const SCOPE = getOrCreateId(sessionStorage, SCOPE_STORAGE_KEY, () => "default");
const PRESENCE_CHANNEL = `channel3-storefront-presence:${SCOPE}`;
const ELECTION_CHANNEL = `channel3-storefront-election:${SCOPE}`;
const ACTIVATION_BROADCAST_INTERVAL_MS = 250;
const HEARTBEAT_INTERVAL_MS = 2000;
const PEER_TTL_MS = 5000;
const ACTIVATION_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

export interface ResultSetPresence {
	query?: string;
	imageUrl?: string;
	transcriptCount: number;
	loadedCount: number;
	delta: { id: string; title: string }[];
	display: "inline" | "fullscreen";
}

export interface PresenceRecord {
	orderKey: OrderKey | null;
	instanceId: string;
	// Sibling instances share a sandbox origin and therefore a clock, so this
	// compares across instances even when their order keys don't.
	activatedAt: number | null;
	resultSets: ResultSetPresence[];
	focus: ViewingContext | null;
	saved: SyncedProduct[];
}

interface PresenceMessage {
	type: "hello" | "update" | "bye";
	instanceId: string;
	presence?: PresenceRecord;
}

export interface PresenceState {
	/** True on exactly one instance: the elected writer of the shared model-context slot. */
	isPublisher: boolean;
	self: PresenceRecord | null;
	peers: PresenceRecord[];
}

export interface PresenceInput {
	orderKey: OrderKey | null;
	instanceId: string;
	resultSets: ResultSetPresence[];
	focus: ViewingContext | null;
	fullscreen: boolean;
	saved: SyncedProduct[];
}

export function usePresence(input: PresenceInput): PresenceState {
	const { orderKey, instanceId, resultSets, focus, fullscreen, saved } = input;
	const [isPublisher, setIsPublisher] = React.useState(false);
	const [peers, setPeers] = React.useState<PresenceRecord[]>([]);
	const [selfState, setSelfState] = React.useState<PresenceRecord | null>(null);
	const activatedAtRef = React.useRef<number | null>(null);

	const latestRef = React.useRef({ orderKey, resultSets, focus, fullscreen, saved });
	latestRef.current = { orderKey, resultSets, focus, fullscreen, saved };

	const peersRef = React.useRef(new Map<string, { presence: PresenceRecord; seenAt: number }>());
	const announceRef = React.useRef<(() => void) | null>(null);
	const lastAnnouncedRef = React.useRef<string | null>(null);

	const buildSelf = React.useCallback((): PresenceRecord => {
		const latest = latestRef.current;
		return {
			orderKey: latest.orderKey,
			instanceId,
			activatedAt: activatedAtRef.current,
			resultSets: latest.resultSets,
			focus: latest.focus,
			saved: latest.saved,
		};
	}, [instanceId]);

	// Publisher election: the library holds a Web Lock (with a message-based fallback)
	// that is released automatically when the holding iframe dies, so takeover needs no
	// heartbeat bookkeeping on our side. Which instance publishes doesn't matter — the
	// report aggregates every instance's presence, ordered by interaction recency.
	React.useEffect(() => {
		const channel = new ElectionChannel(ELECTION_CHANNEL);
		const elector = createLeaderElection(channel);
		let alive = true;
		void elector.awaitLeadership().then(() => {
			if (alive) {
				setIsPublisher(true);
			}
		});
		return () => {
			alive = false;
			setIsPublisher(false);
			void elector.die().finally(() => channel.close());
		};
	}, []);

	React.useEffect(() => {
		if (typeof BroadcastChannel === "undefined") {
			return;
		}
		const peerMap = peersRef.current;
		peerMap.clear();
		const channel = new BroadcastChannel(PRESENCE_CHANNEL);
		let lastSelfKey: string | null = null;
		let lastPeersKey: string | null = null;

		const recount = () => {
			const nextSelf = buildSelf();
			const selfKey = JSON.stringify(nextSelf);
			if (selfKey !== lastSelfKey) {
				lastSelfKey = selfKey;
				setSelfState(nextSelf);
			}
			const now = Date.now();
			const livePeers: PresenceRecord[] = [];
			for (const [id, entry] of peerMap) {
				if (now - entry.seenAt > PEER_TTL_MS) {
					peerMap.delete(id);
					continue;
				}
				livePeers.push(entry.presence);
			}
			const peersKey = JSON.stringify(livePeers);
			if (peersKey !== lastPeersKey) {
				lastPeersKey = peersKey;
				setPeers(livePeers);
			}
		};

		const post = (type: PresenceMessage["type"]) => {
			channel.postMessage({
				type,
				instanceId,
				presence: buildSelf(),
			} satisfies PresenceMessage);
		};

		channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
			const message = event.data;
			if (!message || message.instanceId === instanceId) {
				return;
			}
			if (message.type === "bye") {
				peerMap.delete(message.instanceId);
				recount();
				return;
			}
			if (message.type === "hello") {
				post("update");
			}
			if (message.presence) {
				peerMap.set(message.instanceId, {
					presence: message.presence,
					seenAt: Date.now(),
				});
			}
			recount();
		};
		post("hello");
		recount();
		announceRef.current = () => {
			post("update");
			recount();
		};

		const heartbeat = setInterval(() => {
			post("update");
			recount();
		}, HEARTBEAT_INTERVAL_MS);

		let lastActivationBroadcast = 0;
		const onActivity = (event: Event) => {
			if (!event.isTrusted) {
				return;
			}
			// Inline widgets receive wheel events when the shopper scrolls the conversation
			// past them; only horizontal-dominant wheel is real carousel interaction there.
			// Fullscreen owns its own scrolling, so any wheel counts.
			if (
				event.type === "wheel" &&
				!latestRef.current.fullscreen &&
				Math.abs((event as WheelEvent).deltaY) >= Math.abs((event as WheelEvent).deltaX)
			) {
				return;
			}
			const now = Date.now();
			activatedAtRef.current = now;
			if (now - lastActivationBroadcast < ACTIVATION_BROADCAST_INTERVAL_MS) {
				return;
			}
			lastActivationBroadcast = now;
			post("update");
			recount();
		};
		for (const name of ACTIVATION_EVENTS) {
			window.addEventListener(name, onActivity, { capture: true, passive: true });
		}

		const onPageHide = () => {
			channel.postMessage({ type: "bye", instanceId } satisfies PresenceMessage);
		};
		window.addEventListener("pagehide", onPageHide);

		return () => {
			announceRef.current = null;
			for (const name of ACTIVATION_EVENTS) {
				window.removeEventListener(name, onActivity, { capture: true });
			}
			window.removeEventListener("pagehide", onPageHide);
			clearInterval(heartbeat);
			channel.postMessage({ type: "bye", instanceId } satisfies PresenceMessage);
			channel.close();
		};
	}, [instanceId, buildSelf]);

	// Presence data (focus, loaded pages) must reach siblings and the publisher as soon as
	// it changes, not on the next heartbeat — otherwise a freshly opened PDP is invisible
	// for up to HEARTBEAT_INTERVAL_MS.
	const serialized = JSON.stringify({ orderKey, resultSets, focus, saved });
	React.useEffect(() => {
		if (lastAnnouncedRef.current === serialized) {
			return;
		}
		lastAnnouncedRef.current = serialized;
		announceRef.current?.();
	}, [serialized]);

	return { isPublisher, self: selfState, peers };
}
