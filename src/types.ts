export type Bindings = Env;

export type Props = {
	apiKey: string;
	baseURL?: string;
	isFreeTier: boolean;
	clientIP: string;
};

export type State = null;

export type ToolContext = {
	props: Props;
	env: Bindings;
};

export type ToolContextGetter = () => ToolContext;
