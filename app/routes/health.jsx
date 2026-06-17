import { useLoaderData } from "react-router";

const SHOP_HEALTH_QUERY = `#graphql
  query ShopHealth {
    shop {
      name
      primaryDomain {
        host
        url
      }
    }
  }
`;

function elapsed(startedAt) {
  return Date.now() - startedAt;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function probeStorefront(context) {
  const startedAt = Date.now();

  if (!context.shopifyConfigured) {
    return {
      ok: false,
      status: "missing_config",
      latencyMs: elapsed(startedAt),
      mode: "shopify-storefront-api",
      fallback: "none",
      storeDomain: context.shopifyConfig.storeDomain || "",
      apiVersion: context.shopifyConfig.apiVersion,
      error: "PUBLIC_STORE_DOMAIN and PUBLIC_STOREFRONT_API_TOKEN are required."
    };
  }

  try {
    const data = await context.storefront.query(SHOP_HEALTH_QUERY, {
      cache: context.storefront.CacheNone()
    });

    return {
      ok: true,
      status: "reachable",
      latencyMs: elapsed(startedAt),
      mode: "shopify-storefront-api",
      fallback: "none",
      storeDomain: context.shopifyConfig.storeDomain,
      apiVersion: context.shopifyConfig.apiVersion,
      shopName: data.shop?.name || "",
      primaryDomain: data.shop?.primaryDomain?.host || data.shop?.primaryDomain?.url || ""
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      latencyMs: elapsed(startedAt),
      mode: "shopify-storefront-api",
      fallback: "none",
      storeDomain: context.shopifyConfig.storeDomain,
      apiVersion: context.shopifyConfig.apiVersion,
      error: errorMessage(error)
    };
  }
}

async function probeStaffBackend(baseUrl) {
  const startedAt = Date.now();
  const healthUrl = `${baseUrl}/health`;

  try {
    const response = await fetch(healthUrl, {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => null);

    return {
      ok: response.ok && payload?.ok === true,
      status: response.ok ? "reachable" : "http_error",
      latencyMs: elapsed(startedAt),
      baseUrl,
      httpStatus: response.status,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: "unreachable",
      latencyMs: elapsed(startedAt),
      baseUrl,
      error: errorMessage(error)
    };
  }
}

export const meta = () => [{ title: "Light + Form | Health" }];

export async function loader({ context }) {
  const [storefront, staffBackend] = await Promise.all([
    probeStorefront(context),
    probeStaffBackend(context.staffApiBaseUrl)
  ]);

  return {
    ok: storefront.ok && staffBackend.ok,
    generatedAt: new Date().toISOString(),
    frontend: {
      ok: true,
      service: "hydrogen-storefront",
      mode: "shopify-storefront-api",
      fallback: "none"
    },
    cart: {
      ok: storefront.ok,
      service: "hydrogen-cart",
      mode: "shopify-cart",
      fallback: "none"
    },
    storefront,
    staffBackend
  };
}

function StatusPill({ ok, text }) {
  return <span className={`health-pill ${ok ? "is-ok" : "is-bad"}`}>{text || (ok ? "OK" : "DOWN")}</span>;
}

function HealthRow({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="health-row">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function HealthCard({ title, ok, status, children }) {
  return (
    <article className="health-card">
      <div className="health-card-head">
        <h2>{title}</h2>
        <StatusPill ok={ok} text={status} />
      </div>
      <div className="health-card-body">{children}</div>
    </article>
  );
}

export default function HealthRoute() {
  const data = useLoaderData();
  const backendPayload = data.staffBackend.payload || {};

  return (
    <main className="health-page">
      <section className="site-shell health-shell">
        <div className="health-hero">
          <div>
            <p className="eyebrow">System Health</p>
            <h1>Service status</h1>
          </div>
          <StatusPill ok={data.ok} />
        </div>

        <div className="health-grid">
          <HealthCard title="Frontend" ok={data.frontend.ok} status="reachable">
            <HealthRow label="Service" value={data.frontend.service} />
            <HealthRow label="Catalog mode" value={data.frontend.mode} />
            <HealthRow label="Fallback" value={data.frontend.fallback} />
            <HealthRow label="Generated" value={data.generatedAt} />
          </HealthCard>

          <HealthCard title="Storefront API" ok={data.storefront.ok} status={data.storefront.status}>
            <HealthRow label="Store domain" value={data.storefront.storeDomain} />
            <HealthRow label="API version" value={data.storefront.apiVersion} />
            <HealthRow label="Shop" value={data.storefront.shopName} />
            <HealthRow label="Primary domain" value={data.storefront.primaryDomain} />
            <HealthRow label="Latency" value={`${data.storefront.latencyMs}ms`} />
            <HealthRow label="Error" value={data.storefront.error} />
          </HealthCard>

          <HealthCard title="Cart" ok={data.cart.ok} status={data.cart.ok ? "storefront-backed" : "blocked"}>
            <HealthRow label="Service" value={data.cart.service} />
            <HealthRow label="Mode" value={data.cart.mode} />
            <HealthRow label="Fallback" value={data.cart.fallback} />
          </HealthCard>

          <HealthCard title="Staff IMS API" ok={data.staffBackend.ok} status={data.staffBackend.status}>
            <HealthRow label="Base URL" value={data.staffBackend.baseUrl} />
            <HealthRow label="HTTP" value={data.staffBackend.httpStatus} />
            <HealthRow label="Latency" value={`${data.staffBackend.latencyMs}ms`} />
            <HealthRow label="Catalog source" value={backendPayload.catalogSource} />
            <HealthRow label="Commerce mode" value={backendPayload.commerceMode} />
            <HealthRow label="Admin API configured" value={backendPayload.shopifyConfigured} />
            <HealthRow label="Users store" value={backendPayload.storage?.users} />
            <HealthRow label="Orders store" value={backendPayload.storage?.orders} />
            <HealthRow label="Audit store" value={backendPayload.storage?.audit} />
            <HealthRow label="Error" value={data.staffBackend.error} />
          </HealthCard>
        </div>
      </section>
    </main>
  );
}
