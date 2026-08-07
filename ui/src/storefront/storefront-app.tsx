import type { ProductDetail } from "@channel3/sdk/resources";
import {
	type McpUiHostContext,
	type McpUiToolResultNotification,
	useApp,
	useAutoResize,
	useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { type MountResult, MountResultSchema, SearchCriteriaSchema } from "@shared/wire";
import { Bookmark } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setAnalyticsTarget, trackEvent } from "@/storefront/analytics";
import {
	AppBridge,
	type BrowsePage,
	type StorefrontBridge,
	toolErrorText,
} from "@/storefront/bridge";
import { browseQueryOptions } from "@/storefront/browse-query";
import { BrowseGridSkeleton, BrowseView } from "@/storefront/browse-view";
import { type DetailFocus, DetailView } from "@/storefront/detail-view";
import { detailQueryOptions } from "@/storefront/detail-query";
import { setThreadId } from "@/storefront/identity";
import { InlineError, InlineResults, InlineSearchSkeleton } from "@/storefront/inline-views";
import { type ResultSetPresence, usePresence } from "@/storefront/instance-presence";
import { buildContextReport, toFocusContext, toSyncedProduct } from "@/storefront/model-copy";
import { SavedTray } from "@/storefront/saved-tray";
import type { OrderKey, PendingSearch, SyncedProduct, ViewingContext } from "@/storefront/types";
import { useSavedProducts } from "@/storefront/use-saved-products";

interface SearchState {
	key: string;
	products: ProductDetail[];
	query?: string;
	imageUrl?: string;
	nextPageToken: string | null;
	nonce: number;
}

type Scene = "search" | "detail";

type DetailOrigin = "search" | "inline";

interface DetailState {
	product: ProductDetail;
	origin: DetailOrigin;
	history: ProductDetail[];
	nonce: number;
}

type ToolResultParams = McpUiToolResultNotification["params"];

const REMOUNT_HEAL_DELAY_MS = 750;

const MAX_STACKED_RESULT_SETS = 4;

const RELOAD_FAILURE_MESSAGE =
	"These results couldn't be reloaded. Ask again in the chat to retry.";

interface ModelDrivenScene {
	scene: Scene;
	searches: SearchState[];
	activeKey: string | null;
	detail: DetailState | null;
	pending: PendingSearch | null;
	lostResult: PendingSearch | null;
	toolError: string | null;
	nonceSeq: number;
}

type ModelAction =
	| { type: "input"; input: PendingSearch }
	| {
			type: "result";
			products: ProductDetail[];
			nextPageToken: string | null;
			input: PendingSearch | null;
	  }
	| { type: "error"; message: string }
	| { type: "resultLost"; input: PendingSearch }
	| { type: "cancelled" }
	| { type: "activate"; key: string }
	| { type: "openDetail"; product: ProductDetail; origin: DetailOrigin }
	| { type: "backDetail" }
	| { type: "openSearch" };

const INITIAL_SCENE: ModelDrivenScene = {
	scene: "search",
	searches: [],
	activeKey: null,
	detail: null,
	pending: null,
	lostResult: null,
	toolError: null,
	nonceSeq: 0,
};

function searchKey(input: PendingSearch | null): string {
	return input?.query || input?.imageUrl || "results";
}

function activeSearch(state: {
	searches: SearchState[];
	activeKey: string | null;
}): SearchState | null {
	return (
		state.searches.find((set) => set.key === state.activeKey) ??
		state.searches[state.searches.length - 1] ??
		null
	);
}

function sceneReducer(state: ModelDrivenScene, action: ModelAction): ModelDrivenScene {
	switch (action.type) {
		case "input":
			return { ...state, pending: action.input, toolError: null };
		case "result": {
			const key = searchKey(action.input);
			const nonceSeq = state.nonceSeq + 1;
			const set: SearchState = {
				key,
				products: action.products,
				query: action.input?.query,
				imageUrl: action.input?.imageUrl,
				nextPageToken: action.nextPageToken,
				nonce: nonceSeq,
			};
			const replaced = state.searches.some((existing) => existing.key === key);
			return {
				...state,
				pending: null,
				lostResult: null,
				toolError: null,
				scene: "search",
				searches: replaced
					? state.searches.map((existing) => (existing.key === key ? set : existing))
					: [...state.searches, set].slice(-MAX_STACKED_RESULT_SETS),
				activeKey: key,
				nonceSeq,
			};
		}
		case "activate":
			return { ...state, activeKey: action.key };
		case "error":
			return { ...state, pending: null, lostResult: null, toolError: action.message };
		case "resultLost":
			return { ...state, pending: null, lostResult: action.input };
		case "cancelled":
			return { ...state, pending: null, lostResult: null };
		case "openDetail": {
			const current = state.scene === "detail" ? state.detail : null;
			return {
				...state,
				scene: "detail",
				detail: {
					product: action.product,
					origin: current ? current.origin : action.origin,
					history: current ? [...current.history, current.product] : [],
					nonce: (state.detail?.nonce ?? 0) + 1,
				},
			};
		}
		case "backDetail": {
			if (!state.detail || state.detail.history.length === 0) {
				return state;
			}
			const history = state.detail.history.slice(0, -1);
			return {
				...state,
				detail: {
					product: state.detail.history[state.detail.history.length - 1],
					origin: state.detail.origin,
					history,
					nonce: state.detail.nonce + 1,
				},
			};
		}
		case "openSearch":
			return { ...state, scene: "search" };
		default: {
			const exhaustive: never = action;
			return exhaustive;
		}
	}
}

function readSearchCriteria(source: unknown): PendingSearch | null {
	const parsed = SearchCriteriaSchema.safeParse(source);
	if (!parsed.success) {
		return null;
	}
	const { query, image_url: imageUrl } = parsed.data;
	return query || imageUrl ? { query, imageUrl } : null;
}

function detectPendingInput(
	tool: string | undefined,
	args: Record<string, unknown> | undefined,
): PendingSearch | null {
	switch (tool) {
		case "get_products":
			return { label: "Fetching product details…" };
		case "search_products":
			return readSearchCriteria(args);
		default:
			return null;
	}
}

function useModelDrivenState() {
	const [sceneState, dispatch] = React.useReducer(sceneReducer, INITIAL_SCENE);
	const [orderKey, setOrderKey] = React.useState<OrderKey | null>(null);

	const pendingRef = React.useRef<PendingSearch | null>(null);

	const onToolInput = React.useCallback(
		(tool: string | undefined, args: Record<string, unknown> | undefined) => {
			const input = detectPendingInput(tool, args);
			if (!input) {
				return;
			}
			pendingRef.current = input;
			dispatch({ type: "input", input });
		},
		[],
	);

	const onToolResult = React.useCallback((params: ToolResultParams) => {
		if (params.isError) {
			pendingRef.current = null;
			dispatch({
				type: "error",
				message: toolErrorText(params.content) ?? "The tool call failed.",
			});
			return;
		}
		// A host can deliver concurrent tool results to one instance, and the bridge
		// identifies neither, so only the echoed criteria pair a result to its search.
		const input = readSearchCriteria(params.structuredContent) ?? pendingRef.current;
		pendingRef.current = null;
		const parsed = MountResultSchema.safeParse(params.structuredContent);
		if (!parsed.success) {
			if (input && (input.query || input.imageUrl)) {
				dispatch({ type: "resultLost", input });
			} else if (input) {
				dispatch({ type: "error", message: RELOAD_FAILURE_MESSAGE });
			}
			return;
		}
		const result = parsed.data as MountResult;
		setAnalyticsTarget(result.server_origin, result.session_id);
		if (result.thread_id) {
			setThreadId(result.thread_id);
		}
		const asOf = result.as_of ? Date.parse(result.as_of) : Number.NaN;
		if (Number.isFinite(asOf)) {
			setOrderKey({ asOf, seq: result.seq ?? 0 });
		}
		if (result.query || result.image_url) {
			trackEvent("search_initiated", {
				query: result.query,
				image_url: result.image_url,
				result_count: result.products.length,
			});
		}
		dispatch({
			type: "result",
			products: result.products,
			nextPageToken: result.next_page_token ?? null,
			input,
		});
	}, []);

	const onToolCancelled = React.useCallback(() => {
		pendingRef.current = null;
		dispatch({ type: "cancelled" });
	}, []);

	const openDetail = React.useCallback(
		(product: ProductDetail, origin: DetailOrigin = "search") => {
			trackEvent("product_clicked", {
				product_id: product.id,
				title: product.title,
				origin,
			});
			dispatch({ type: "openDetail", product, origin });
		},
		[],
	);

	const activate = React.useCallback((key: string) => dispatch({ type: "activate", key }), []);

	const openSearch = React.useCallback(() => dispatch({ type: "openSearch" }), []);

	const backDetail = React.useCallback(() => dispatch({ type: "backDetail" }), []);

	const hydrate = React.useCallback(
		(products: ProductDetail[], nextPageToken: string | null, input: PendingSearch | null) => {
			dispatch({ type: "result", products, nextPageToken, input });
		},
		[],
	);

	const failHydration = React.useCallback((message: string) => {
		dispatch({ type: "error", message });
	}, []);

	return {
		...sceneState,
		search: activeSearch(sceneState),
		orderKey,
		onToolInput,
		onToolResult,
		onToolCancelled,
		openDetail,
		activate,
		openSearch,
		backDetail,
		hydrate,
		failHydration,
	};
}

type ModelDrivenState = ReturnType<typeof useModelDrivenState>;

const INLINE_SETTLE_MS = 300;

function hydrationMarkerKey(instanceId: string): string {
	return `channel3-storefront:hydrated:${instanceId}`;
}

function hasHydratedBefore(instanceId: string): boolean {
	try {
		return localStorage.getItem(hydrationMarkerKey(instanceId)) !== null;
	} catch {
		return false;
	}
}

function fetchFirstBrowsePage(
	queryClient: QueryClient,
	bridge: StorefrontBridge,
	input: { query?: string; imageUrl?: string },
): Promise<BrowsePage> {
	return queryClient.fetchInfiniteQuery(browseQueryOptions(bridge, input)).then((data) => {
		const page = data.pages[0];
		if (!page) {
			throw new Error("browse_products returned no page");
		}
		return page;
	});
}

function StorefrontCore({
	bridge,
	state,
	hostContext,
}: {
	bridge: StorefrontBridge;
	state: ModelDrivenState;
	hostContext: McpUiHostContext | undefined;
}) {
	const { search, searches, detail, scene, pending, lostResult, toolError } = state;
	const { hydrate, failHydration } = state;
	const queryClient = useQueryClient();

	const displayMode = hostContext?.displayMode ?? "inline";
	const fullscreen = displayMode === "fullscreen";
	const [expandedInline, setExpandedInline] = React.useState(false);

	const [savedOpen, setSavedOpen] = React.useState(false);
	const saved = useSavedProducts(bridge, savedOpen);

	const [settlingInline, setSettlingInline] = React.useState(false);
	const wasFullscreen = React.useRef(fullscreen);
	React.useEffect(() => {
		const leftFullscreen = wasFullscreen.current && !fullscreen;
		wasFullscreen.current = fullscreen;
		if (!leftFullscreen) {
			return;
		}
		setSettlingInline(true);
		const timer = setTimeout(() => setSettlingInline(false), INLINE_SETTLE_MS);
		return () => clearTimeout(timer);
	}, [fullscreen]);

	const locale = hostContext?.locale;
	const insets = hostContext?.safeAreaInsets;

	const scrollRef = React.useRef<HTMLDivElement>(null);
	const detailNonce = scene === "detail" ? detail?.nonce : undefined;
	React.useLayoutEffect(() => {
		if (detailNonce !== undefined) {
			scrollRef.current?.scrollTo({ top: 0 });
		}
	}, [detailNonce]);

	const hostInstanceId = hostContext?.toolInfo?.id;
	const instanceId = React.useMemo(
		() => (hostInstanceId != null ? String(hostInstanceId) : crypto.randomUUID()),
		[hostInstanceId],
	);

	const [loadedProducts, setLoadedProducts] = React.useState<{
		nonce: number;
		products: SyncedProduct[];
	} | null>(null);
	const [detailFocus, setDetailFocus] = React.useState<{
		nonce: number;
		focus: DetailFocus;
	} | null>(null);
	const detailNonceForFocus = detail?.nonce;
	const handleDetailFocus = React.useCallback(
		(focus: DetailFocus) => {
			if (detailNonceForFocus === undefined) {
				return;
			}
			setDetailFocus({ nonce: detailNonceForFocus, focus });
		},
		[detailNonceForFocus],
	);
	const searchNonce = search?.nonce;
	const handleResultsChange = React.useCallback(
		(products: ProductDetail[]) => {
			if (searchNonce === undefined) {
				return;
			}
			setLoadedProducts({ nonce: searchNonce, products: products.map(toSyncedProduct) });
		},
		[searchNonce],
	);

	const healSearch = React.useCallback(
		(input: PendingSearch) => {
			let cancelled = false;
			fetchFirstBrowsePage(queryClient, bridge, input)
				.then((page) => {
					if (!cancelled) {
						hydrate(page.products, page.nextPageToken, input);
					}
				})
				.catch(() => {
					if (!cancelled) {
						failHydration(RELOAD_FAILURE_MESSAGE);
					}
				});
			return () => {
				cancelled = true;
			};
		},
		[queryClient, bridge, hydrate, failHydration],
	);

	React.useEffect(() => {
		if (!search || !hostInstanceId) {
			return;
		}
		try {
			localStorage.setItem(hydrationMarkerKey(String(hostInstanceId)), "1");
		} catch {}
	}, [search, hostInstanceId]);

	const healablePending = pending && (pending.query || pending.imageUrl) ? pending : null;
	React.useEffect(() => {
		if (!healablePending || !hostInstanceId || !hasHydratedBefore(String(hostInstanceId))) {
			return;
		}
		let cancel = () => {};
		const timer = setTimeout(() => {
			cancel = healSearch(healablePending);
		}, REMOUNT_HEAL_DELAY_MS);
		return () => {
			clearTimeout(timer);
			cancel();
		};
	}, [healablePending, hostInstanceId, healSearch]);

	React.useEffect(() => {
		if (!lostResult) {
			return;
		}
		return healSearch(lostResult);
	}, [lostResult, healSearch]);

	const synced =
		search && loadedProducts?.nonce === search.nonce
			? loadedProducts.products
			: (search?.products.map(toSyncedProduct) ?? []);
	const focused =
		scene === "detail" && detail && detailFocus?.nonce === detail.nonce
			? detailFocus.focus
			: null;
	const focusProduct = focused?.product ?? detail?.product;
	const viewing: ViewingContext | null =
		scene === "detail" && detail && focusProduct
			? toFocusContext(focusProduct, {
					inTranscript: searches.some((set) =>
						set.products.some((p) => p.id === focusProduct.id),
					),
					variantTitle:
						focusProduct.id !== detail.product.id ? focusProduct.title : undefined,
					priceStats: focused?.priceStats,
				})
			: search
				? {
						kind: "search",
						query: search.query,
						imageUrl: search.imageUrl,
						products: synced,
					}
				: null;

	// Only the active set can grow past its transcript products: paging happens in the
	// view the shopper opened.
	const resultSets: ResultSetPresence[] = searches.map((set) => {
		const active = set.key === search?.key;
		const loaded = active ? synced : set.products.map(toSyncedProduct);
		return {
			query: set.query,
			imageUrl: set.imageUrl,
			transcriptCount: set.products.length,
			loadedCount: loaded.length,
			delta: loaded.slice(set.products.length).map((p) => ({ id: p.id, title: p.title })),
			display: active && fullscreen ? "fullscreen" : "inline",
		};
	});

	const presence = usePresence({
		orderKey: state.orderKey,
		instanceId,
		resultSets,
		focus: viewing,
		fullscreen,
		saved: saved.syncedSaved,
	});
	const { isPublisher, self, peers } = presence;

	React.useEffect(() => {
		if (!isPublisher || !self) {
			return;
		}
		bridge.syncContext(buildContextReport(self, peers));
	}, [bridge, isPublisher, self, peers]);

	const goFullscreen = React.useCallback(async () => {
		const granted = await bridge.requestFullscreen().catch(() => false);
		if (!granted) {
			setExpandedInline(true);
		}
	}, [bridge]);

	const goInline = React.useCallback(() => {
		state.openSearch();
		setExpandedInline(false);
		if (fullscreen) {
			void bridge.requestInline();
		}
	}, [bridge, fullscreen, state]);

	const compareSaved = React.useCallback(() => {
		const ids = saved.syncedSaved.map((p) => p.id);
		trackEvent("compare_requested", { product_ids: ids, count: ids.length });
		bridge
			.sendChatMessage(
				`Compare the products I saved: ${ids.join(", ")} - call get_products with these IDs and give me a personalized comparison between them.`,
			)
			.catch((error: unknown) => {
				console.warn("compare message failed to send", error);
			});
	}, [bridge, saved.syncedSaved]);

	const openDetailFromInline = React.useCallback(
		(product: ProductDetail, sourceKey: string) => {
			state.activate(sourceKey);
			state.openDetail(product, "inline");
			if (!fullscreen) {
				void goFullscreen();
			}
		},
		[state, fullscreen, goFullscreen],
	);

	const browseAll = React.useCallback(
		(sourceKey: string) => {
			state.activate(sourceKey);
			state.openSearch();
			void goFullscreen();
		},
		[state, goFullscreen],
	);

	const prefetchProduct = React.useCallback(
		(product: ProductDetail) => {
			void queryClient.prefetchQuery(detailQueryOptions(bridge, product.id));
		},
		[bridge, queryClient],
	);

	const wideLayout = (sceneBody: React.ReactNode) => (
		<div
			ref={scrollRef}
			className={cn(
				"@container min-w-0",
				fullscreen
					? "h-full overflow-y-auto pb-(--inset-bottom) scroll-pb-(--inset-bottom) scrollbar-hidden"
					: "min-h-full",
			)}
		>
			<div className="mx-auto w-full max-w-7xl">{sceneBody}</div>
		</div>
	);

	let body: React.ReactNode;

	if (fullscreen || expandedInline) {
		const exitWide = fullscreen
			? search
				? state.openSearch
				: () => void bridge.requestInline()
			: () => setExpandedInline(false);
		const backFromDetail: Record<DetailOrigin, () => void> = {
			search: exitWide,
			inline: goInline,
		};
		const onDetailBack =
			detail && detail.history.length > 0
				? state.backDetail
				: detail
					? backFromDetail[detail.origin]
					: undefined;
		const sceneBody =
			scene === "detail" && detail ? (
				<DetailView
					key={detail.nonce}
					product={detail.product}
					bridge={bridge}
					saved={saved}
					onSelect={(product) => state.openDetail(product, detail.origin)}
					onBack={onDetailBack}
					onFocusChange={handleDetailFocus}
					locale={locale}
				/>
			) : search ? (
				<BrowseView
					key={search.nonce}
					bridge={bridge}
					saved={saved}
					initialQuery={search.query}
					initialImageUrl={search.imageUrl}
					initialResults={search.products}
					initialNextPageToken={search.nextPageToken}
					onSelect={state.openDetail}
					onPrefetchProduct={prefetchProduct}
					onResultsChange={handleResultsChange}
					onExit={fullscreen ? undefined : exitWide}
					locale={locale}
				/>
			) : toolError ? (
				<div className="p-4">
					<InlineError message={toolError} />
				</div>
			) : (
				<BrowseGridSkeleton
					caption={pending?.query ? `Searching for “${pending.query}”…` : pending?.label}
				/>
			);
		body = (
			<div
				className={cn(
					"relative flex w-full max-sm:overflow-hidden",
					fullscreen && "h-full min-h-0",
				)}
			>
				<div className="h-full min-w-0 flex-1">{wideLayout(sceneBody)}</div>
				<SavedTray
					saved={saved}
					open={savedOpen}
					onSelect={(product) => state.openDetail(product, "search")}
					onCompare={compareSaved}
					onClose={() => setSavedOpen(false)}
				/>
			</div>
		);
	} else if (settlingInline) {
		body = <InlineSearchSkeleton />;
	} else if (searches.length > 0) {
		body = (
			<div className="flex flex-col gap-6">
				{searches.map((set) => (
					<InlineResults
						key={set.key}
						products={set.products}
						saved={saved}
						onSelect={(product) => openDetailFromInline(product, set.key)}
						onPrefetchProduct={prefetchProduct}
						onBrowseAll={() => browseAll(set.key)}
						onShowSaved={() => {
							browseAll(set.key);
							setSavedOpen(true);
						}}
						locale={locale}
					/>
				))}
				{pending ? <InlineSearchSkeleton /> : null}
				{toolError ? <InlineError message={toolError} /> : null}
			</div>
		);
	} else if (toolError) {
		body = <InlineError message={toolError} />;
	} else {
		body = <InlineSearchSkeleton />;
	}

	return (
		<div
			className={cn(
				"relative text-foreground",
				fullscreen ? "h-svh overflow-hidden" : "min-h-full",
				(fullscreen || expandedInline) && "bg-background",
				fullscreen && "fullscreen",
				"pt-(--inset-top) pr-(--inset-right) pl-(--inset-left)",
				!fullscreen && "pb-(--inset-bottom)",
			)}
			style={
				{
					"--inset-top": `${insets?.top ?? 0}px`,
					"--inset-right": `${insets?.right ?? 0}px`,
					"--inset-bottom": `${insets?.bottom ?? 0}px`,
					"--inset-left": `${insets?.left ?? 0}px`,
				} as React.CSSProperties
			}
		>
			{body}
			{(fullscreen || expandedInline) && !savedOpen ? (
				<Button
					onClick={() => setSavedOpen(true)}
					aria-label={
						saved.count > 0
							? `Open saved products (${saved.count})`
							: "Open saved products"
					}
					className={cn(
						"absolute right-[calc(1.5rem+var(--inset-right))] z-20 size-12 rounded-full shadow-lg",
						fullscreen
							? "top-[calc(1.5rem+var(--inset-top))]"
							: "top-[calc(4rem+var(--inset-top))]",
					)}
				>
					<Bookmark className="size-5" />
					{saved.count > 0 ? (
						<span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-[10px] tabular-nums">
							{saved.count}
						</span>
					) : null}
				</Button>
			) : null}
		</div>
	);
}

function hostControlsHeight(hostContext: McpUiHostContext | undefined): boolean {
	const dimensions = hostContext?.containerDimensions;
	return dimensions !== undefined && "height" in dimensions;
}

export function HostedStorefront() {
	const state = useModelDrivenState();
	const [hostContext, setHostContext] = React.useState<McpUiHostContext | undefined>();
	const { onToolInput, onToolResult, onToolCancelled } = state;

	const { app, error } = useApp({
		appInfo: { name: "channel3-storefront", version: "1.0.0" },
		capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
		autoResize: false,
		onAppCreated: (created) => {
			created.addEventListener("toolinput", (params) =>
				onToolInput(created.getHostContext()?.toolInfo?.tool?.name, params.arguments),
			);
			created.addEventListener("toolresult", onToolResult);
			created.addEventListener("toolcancelled", onToolCancelled);
			created.addEventListener("hostcontextchanged", () =>
				setHostContext(created.getHostContext()),
			);
		},
	});

	const context = hostContext ?? app?.getHostContext();

	useHostStyles(app, context);

	useAutoResize(hostControlsHeight(context) ? null : app);

	React.useEffect(() => {
		if (app) {
			setHostContext(app.getHostContext());
		}
	}, [app]);

	const bridge = React.useMemo(() => (app ? new AppBridge(app) : null), [app]);

	if (error) {
		return <InlineError message={`Could not connect to the host: ${error.message}`} />;
	}
	if (!bridge) {
		return <InlineSearchSkeleton />;
	}
	return <StorefrontCore bridge={bridge} state={state} hostContext={context} />;
}
