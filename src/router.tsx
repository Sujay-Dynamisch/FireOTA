import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** A server function rejected the call for lack of a session: send the browser to sign in. */
function redirectIfUnauthorized(error: unknown) {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  if (!/^(Error:\s*)?Unauthorized/i.test(message)) return;
  if (window.location.pathname !== "/login") window.location.assign("/login");
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: redirectIfUnauthorized }),
    mutationCache: new MutationCache({ onError: redirectIfUnauthorized }),
    defaultOptions: {
      queries: {
        // Retrying cannot fix a missing session.
        retry: (count, error) => !/Unauthorized/i.test(error instanceof Error ? error.message : "") && count < 3,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
