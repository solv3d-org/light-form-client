import { Analytics, getShopAnalytics, useNonce } from "@shopify/hydrogen";
import { useEffect, useState } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData
} from "react-router";
import siteStyles from "../assets/site.css?url";
import SiteLayout from "../src/components/SiteLayout";
import { CartDrawerProvider } from "../src/context/CartDrawerContext";
import { configureStaffApiBaseUrl } from "../src/lib/staffApi";
import { getInitialTheme, saveManualThemeOverride } from "../src/lib/theme";

export function links() {
  return [
    { rel: "icon", href: "/favicon.ico" },
    { rel: "preconnect", href: "https://cdn.shopify.com" },
    { rel: "preconnect", href: "https://shop.app" }
  ];
}

export async function loader({ context, request }) {
  const { cart, env, shopifyConfig, shopifyConfigured, staffApiBaseUrl, storefront } = context;
  const isHealthRoute = new URL(request.url).pathname === "/health";
  const cartData = shopifyConfigured && !isHealthRoute ? await cart.get() : null;

  return {
    cart: cartData,
    shopifyConfigured,
    staffApiBaseUrl,
    storeDomain: shopifyConfig.storeDomain,
    shop: shopifyConfigured && !isHealthRoute
      ? getShopAnalytics({
          storefront,
          publicStorefrontId: env.PUBLIC_STOREFRONT_ID
        })
      : null,
    consent: shopifyConfigured && !isHealthRoute
      ? {
          checkoutDomain: shopifyConfig.checkoutDomain,
          storefrontAccessToken: shopifyConfig.storefrontAccessToken,
          withPrivacyBanner: false,
          country: storefront.i18n.country,
          language: storefront.i18n.language
        }
      : null
  };
}

export function Layout({ children }) {
  const nonce = useNonce();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={siteStyles} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData("root");
  const [theme, setTheme] = useState(() => getInitialTheme());

  if (typeof window !== "undefined" && data?.staffApiBaseUrl) {
    configureStaffApiBaseUrl(data.staffApiBaseUrl);
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    saveManualThemeOverride(nextTheme);
  };

  const content = (
    <CartDrawerProvider>
      <SiteLayout>
        <Outlet context={{ theme, onThemeChange: handleThemeChange }} />
      </SiteLayout>
    </CartDrawerProvider>
  );

  if (!data?.shop || !data?.consent) return content;

  return (
    <Analytics.Provider cart={data.cart} shop={data.shop} consent={data.consent}>
      {content}
    </Analytics.Provider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.data?.message || error.statusText
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">{status}</p>
            <h1>{message}</h1>
          </div>
        </div>
      </section>
    </main>
  );
}
