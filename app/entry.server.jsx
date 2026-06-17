import { createContentSecurityPolicy } from "@shopify/hydrogen";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter } from "react-router";

export default async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext, context) {
  const shop = context.shopifyConfigured
    ? {
        checkoutDomain: context.shopifyConfig.checkoutDomain,
        storeDomain: context.shopifyConfig.storeDomain
      }
    : undefined;
  const { nonce, header, NonceProvider } = createContentSecurityPolicy({ shop });
  const body = await renderToReadableStream(
    <NonceProvider>
      <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      }
    }
  );

  if (isbot(request.headers.get("user-agent"))) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("Content-Security-Policy", header);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode
  });
}
