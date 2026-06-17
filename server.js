import * as serverBuild from "virtual:react-router/server-build";
import { createRequestHandler, storefrontRedirect } from "@shopify/hydrogen";
import { createHydrogenRouterContext } from "./app/lib/context";

export default {
  async fetch(request, env, executionContext) {
    try {
      const pathname = new URL(request.url).pathname;
      const isHealthRoute = pathname === "/health";
      const hydrogenContext = await createHydrogenRouterContext(request, env, executionContext, {
        requireShopify: !isHealthRoute
      });
      const handleRequest = createRequestHandler({
        build: serverBuild,
        mode: process.env.NODE_ENV,
        getLoadContext: () => hydrogenContext
      });
      const response = await handleRequest(request);

      if (hydrogenContext.session.isPending) {
        response.headers.set("Set-Cookie", await hydrogenContext.session.commit());
      }

      if (response.status === 404 && hydrogenContext.shopifyConfigured) {
        return storefrontRedirect({
          request,
          response,
          storefront: hydrogenContext.storefront
        });
      }

      return response;
    } catch (error) {
      console.error(error);
      return new Response("An unexpected error occurred", { status: 500 });
    }
  }
};
