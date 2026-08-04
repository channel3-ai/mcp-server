import type { ProductDetail } from "@channel3/sdk/resources";
import {
	type McpUiHostContext,
	type McpUiToolResultNotification,
	useApp,
	useAutoResize,
	useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { cn } from "@/lib/utils";
import {
	AppBridge,
	type BrowsePage,
	type StorefrontBridge,
	toolErrorText,
} from "@/storefront/bridge";
import { browseQueryOptions } from "@/storefront/browse-query";
import { BrowseGridSkeleton, BrowseView } from "@/storefront/browse-view";
import { type DetailFocus, DetailView } from "@/storefront/detail-view";
import { InlineError, InlineResults, InlineSearchSkeleton } from "@/storefront/inline-views";
import { type ResultSetPresence, usePresence } from "@/storefront/instance-presence";
import { buildContextReport, toFocusContext, toSyncedProduct } from "@/storefront/model-copy";
import type { PendingSearch, SyncedProduct, ViewingContext } from "@/storefront/types";

interface SearchState {
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

const RELOAD_FAILURE_MESSAGE =
	"These results couldn't be reloaded. Ask again in the chat to retry.";

interface ModelDrivenScene {
	scene: Scene;
	search: SearchState | null;
	detail: DetailState | null;
	pending: PendingSearch | null;
	lostResult: PendingSearch | null;
	toolError: string | null;
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
	| { type: "openDetail"; product: ProductDetail; origin: DetailOrigin }
	| { type: "backDetail" }
	| { type: "openSearch" };

const INITIAL_SCENE: ModelDrivenScene = {
	scene: "search",
	search: null,
	detail: null,
	pending: null,
	lostResult: null,
	toolError: null,
};

function sceneReducer(state: ModelDrivenScene, action: ModelAction): ModelDrivenScene {
	switch (action.type) {
		case "input":
			return { ...state, pending: action.input, toolError: null };
		case "result":
			return {
				...state,
				pending: null,
				lostResult: null,
				toolError: null,
				scene: "search",
				search: {
					products: action.products,
					query: action.input?.query,
					imageUrl: action.input?.imageUrl,
					nextPageToken: action.nextPageToken,
					nonce: (state.search?.nonce ?? 0) + 1,
				},
			};
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

function detectPendingInput(
	tool: string | undefined,
	args: Record<string, unknown> | undefined,
): PendingSearch | null {
	switch (tool) {
		case "get_products":
			return { label: "Fetching product details…" };
		case "search_products": {
			const query = typeof args?.query === "string" ? args.query : undefined;
			const imageUrl = typeof args?.image_url === "string" ? args.image_url : undefined;
			return query || imageUrl ? { query, imageUrl } : null;
		}
		default:
			return null;
	}
}

function useModelDrivenState() {
	const [sceneState, dispatch] = React.useReducer(sceneReducer, INITIAL_SCENE);
	const [orderKey, setOrderKey] = React.useState<number | null>(null);

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
		const sc = params.structuredContent as Record<string, unknown> | undefined;
		const input = pendingRef.current;
		pendingRef.current = null;
		if (!sc || !Array.isArray(sc.products)) {
			if (input && (input.query || input.imageUrl)) {
				dispatch({ type: "resultLost", input });
			} else if (input) {
				dispatch({ type: "error", message: RELOAD_FAILURE_MESSAGE });
			}
			return;
		}
		if (typeof sc.as_of === "string") {
			const ms = Date.parse(sc.as_of);
			if (Number.isFinite(ms)) {
				setOrderKey(ms);
			}
		}
		dispatch({
			type: "result",
			products: sc.products as ProductDetail[],
			nextPageToken: typeof sc.next_page_token === "string" ? sc.next_page_token : null,
			input,
		});
	}, []);

	const onToolCancelled = React.useCallback(() => {
		pendingRef.current = null;
		dispatch({ type: "cancelled" });
	}, []);

	const openDetail = React.useCallback(
		(product: ProductDetail, origin: DetailOrigin = "search") => {
			dispatch({ type: "openDetail", product, origin });
		},
		[],
	);

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
		orderKey,
		onToolInput,
		onToolResult,
		onToolCancelled,
		openDetail,
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
	const { search, detail, scene, pending, lostResult, toolError } = state;
	const { hydrate, failHydration } = state;
	const queryClient = useQueryClient();

	const displayMode = hostContext?.displayMode ?? "inline";
	const fullscreen = displayMode === "fullscreen";
	const [expandedInline, setExpandedInline] = React.useState(false);

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
					inTranscript: search?.products.some((p) => p.id === focusProduct.id) ?? false,
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

	const initialCount = search?.products.length ?? 0;
	const resultSet: ResultSetPresence | null = search
		? {
				transcriptCount: initialCount,
				loadedCount: synced.length,
				delta: synced.slice(initialCount).map((p) => ({ id: p.id, title: p.title })),
				display: fullscreen ? "fullscreen" : "inline",
			}
		: null;

	const presence = usePresence({
		orderKey: state.orderKey,
		instanceId,
		query: search?.query,
		imageUrl: search?.imageUrl,
		resultSet,
		focus: viewing,
		fullscreen,
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

	const openDetailFromInline = React.useCallback(
		(product: ProductDetail) => {
			state.openDetail(product, "inline");
			if (!fullscreen) {
				void goFullscreen();
			}
		},
		[state, fullscreen, goFullscreen],
	);

	const prefetchProduct = React.useCallback(
		(product: ProductDetail) => {
			void queryClient.prefetchQuery({
				queryKey: ["details", product.id],
				queryFn: () => bridge.getProduct(product.id),
			});
		},
		[bridge, queryClient],
	);

	const wideLayout = (sceneBody: React.ReactNode) => (
		<div
			ref={scrollRef}
			className={cn(
				"@container min-w-0",
				fullscreen
					? "h-full overflow-y-auto pb-(--inset-bottom) scroll-pb-(--inset-bottom)"
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
					onSelect={(product) => state.openDetail(product, detail.origin)}
					onBack={onDetailBack}
					onFocusChange={handleDetailFocus}
					locale={locale}
				/>
			) : search ? (
				<BrowseView
					key={search.nonce}
					bridge={bridge}
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
		body = wideLayout(sceneBody);
	} else if (pending) {
		body = <InlineSearchSkeleton />;
	} else if (toolError) {
		body = <InlineError message={toolError} />;
	} else if (settlingInline) {
		body = <InlineSearchSkeleton />;
	} else if (search) {
		body = (
			<InlineResults
				products={search.products}
				onSelect={openDetailFromInline}
				onPrefetchProduct={prefetchProduct}
				onBrowseAll={() => {
					state.openSearch();
					void goFullscreen();
				}}
				locale={locale}
			/>
		);
	} else {
		body = <InlineSearchSkeleton />;
	}

	return (
		<div
			className={cn(
				"text-foreground",
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
