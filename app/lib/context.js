import { createHydrogenContext, InMemoryCache } from "@shopify/hydrogen";
import { AppSession } from "./session";
import { CART_QUERY_FRAGMENT } from "./fragments";
import { getHydrogenRuntime } from "../../src/lib/shopifyConfig";

export async function createHydrogenRouterContext(request, env = {}, executionContext = {}) {
  const runtime = getHydrogenRuntime(env);
  const waitUntil = executionContext.waitUntil?.bind(executionContext) || (() => {});
  const cache = globalThis.caches ? await caches.open("hydrogen") : new InMemoryCache();
  const session = await AppSession.init(request, [runtime.env.SESSION_SECRET]);

  return createHydrogenContext(
    {
      env: runtime.env,
      request,
      cache,
      waitUntil,
      session,
      i18n: { language: "EN", country: "SG" },
      storefront: {
        apiVersion: runtime.shopifyConfig.apiVersion
      },
      cart: {
        queryFragment: CART_QUERY_FRAGMENT
      }
    },
    {
      shopifyConfig: runtime.shopifyConfig,
      shopifyConfigured: runtime.shopifyConfigured,
      staffApiBaseUrl: runtime.staffApiBaseUrl
    }
  );
}
