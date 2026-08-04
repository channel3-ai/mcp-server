import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { HostedStorefront } from "@/storefront/storefront-app";
import "./globals.css";

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<HostedStorefront />
	</QueryClientProvider>,
);
