import type { PriceHistoryPoint } from "@channel3/sdk/resources";
import * as React from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { currencyFormatter, formatCurrency } from "@/registry/default/lib/format";

const WIDTH = 640;
const HEIGHT = 224;
const PAD = { top: 8, right: 8, bottom: 24, left: 56 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;
const Y_TICKS = 4;
const X_TICKS = 5;

export interface PriceChartProps extends React.ComponentProps<"div"> {
	history: ReadonlyArray<PriceHistoryPoint>;
	currency?: string;
	locale?: string;
}

export function PriceChart({ history, currency, locale, className, ...props }: PriceChartProps) {
	const points = React.useMemo(
		() => [...history].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
		[history],
	);

	if (points.length === 0) {
		return (
			<Empty className={className} {...props}>
				<EmptyHeader>
					<EmptyTitle>No price history</EmptyTitle>
					<EmptyDescription>
						Price tracking hasn't recorded any data points yet.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<Chart
			points={points}
			currency={currency}
			locale={locale}
			className={className}
			{...props}
		/>
	);
}

interface HoverState {
	index: number;
	point: PriceHistoryPoint;
}

function Chart({
	points,
	currency,
	locale,
	className,
	...props
}: {
	points: PriceHistoryPoint[];
	currency?: string;
	locale?: string;
} & React.ComponentProps<"div">) {
	const gradientId = React.useId();
	const [hover, setHover] = React.useState<HoverState | null>(null);

	const code = currency ?? points[0]?.currency ?? "USD";

	const geometry = React.useMemo(() => {
		const prices = points.map((p) => p.price);
		const lo = Math.min(...prices);
		const hi = Math.max(...prices);
		const pad = (hi - lo || hi || 1) * 0.15;
		const yMin = Math.max(0, lo - pad);
		const yMax = hi + pad;

		const x = (i: number) =>
			PAD.left + (points.length === 1 ? INNER_W / 2 : (i / (points.length - 1)) * INNER_W);
		const y = (price: number) => PAD.top + INNER_H - ((price - yMin) / (yMax - yMin)) * INNER_H;

		const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.price)}`).join(" ");
		const area = `${line} L${x(points.length - 1)},${PAD.top + INNER_H} L${x(0)},${PAD.top + INNER_H} Z`;

		const yTicks = Array.from(
			{ length: Y_TICKS },
			(_, i) => yMin + ((yMax - yMin) * i) / (Y_TICKS - 1),
		);
		const tickCount = Math.min(X_TICKS, points.length);
		const xTicks = Array.from({ length: tickCount }, (_, i) => {
			const index = Math.round((i * (points.length - 1)) / (tickCount - 1 || 1));
			return {
				x: x(index),
				label: new Date(points[index].timestamp).toLocaleDateString(locale, {
					month: "short",
					day: "numeric",
				}),
			};
		});

		return { lo, hi, x, y, line, area, yTicks, xTicks };
	}, [points, locale]);

	const formatAxis = React.useCallback(
		(value: number) =>
			currencyFormatter(code, locale, {
				notation: "compact",
				maximumFractionDigits: 1,
			})?.format(value) ?? formatCurrency(value, code, locale),
		[code, locale],
	);

	const onHover = (event: React.MouseEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const ratio =
			(event.clientX - rect.left - (PAD.left / WIDTH) * rect.width) /
			((INNER_W / WIDTH) * rect.width);
		const index = Math.max(
			0,
			Math.min(points.length - 1, Math.round(ratio * (points.length - 1))),
		);
		setHover((prev) => (prev?.index === index ? prev : { index, point: points[index] }));
	};

	const { x, y } = geometry;

	return (
		<div className={cn("relative aspect-16/7 w-full", className)} {...props}>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				className="h-full w-full"
				role="img"
				aria-label={`Price history over the last 30 days, ranging from ${formatCurrency(geometry.lo, code, locale)} to ${formatCurrency(geometry.hi, code, locale)}`}
				onMouseMove={onHover}
				onMouseLeave={() => setHover(null)}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.3} />
						<stop offset="95%" stopColor="var(--color-price)" stopOpacity={0.02} />
					</linearGradient>
				</defs>
				{geometry.yTicks.map((tick) => (
					<g key={tick}>
						<line
							x1={PAD.left}
							x2={WIDTH - PAD.right}
							y1={y(tick)}
							y2={y(tick)}
							className="stroke-border/50"
							strokeDasharray="2 4"
						/>
						<text
							x={PAD.left - 8}
							y={y(tick)}
							dominantBaseline="middle"
							textAnchor="end"
							className="fill-muted-foreground text-2xs"
						>
							{formatAxis(tick)}
						</text>
					</g>
				))}
				{geometry.xTicks.map((tick) => (
					<text
						key={tick.x}
						x={tick.x}
						y={HEIGHT - 6}
						textAnchor="middle"
						className="fill-muted-foreground text-2xs"
					>
						{tick.label}
					</text>
				))}
				<path d={geometry.area} fill={`url(#${gradientId})`} />
				<path
					d={geometry.line}
					fill="none"
					stroke="var(--color-price)"
					strokeWidth={2}
					strokeLinejoin="round"
				/>
				{hover ? (
					<g>
						<line
							x1={x(hover.index)}
							x2={x(hover.index)}
							y1={PAD.top}
							y2={PAD.top + INNER_H}
							className="stroke-border"
						/>
						<circle
							cx={x(hover.index)}
							cy={y(hover.point.price)}
							r={4}
							fill="var(--color-price)"
						/>
					</g>
				) : null}
			</svg>
			{hover ? (
				<div
					className="pointer-events-none absolute rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-sm"
					style={{
						left: `${(x(hover.index) / WIDTH) * 100}%`,
						top: 0,
						transform: `translateX(${x(hover.index) / WIDTH > 0.7 ? "-100%" : "0"})`,
					}}
				>
					<div className="font-medium">
						{formatCurrency(hover.point.price, code, locale)}
					</div>
					<div className="text-muted-foreground">
						{new Date(hover.point.timestamp).toLocaleDateString(locale, {
							year: "numeric",
							month: "short",
							day: "numeric",
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}
