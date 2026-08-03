export type Bindings = Env;

export type Props = {
	apiKey: string;
	baseURL?: string;
	isFreeTier: boolean;
	clientIP: string;
	userAgent: string;
};

export type ToolContext = {
	props: Props;
	env: Bindings;
};
