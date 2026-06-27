const SITEMAP_QUERY = `#graphql
  query Sitemap {
    products(first: 250) {
      nodes {
        handle
        updatedAt
      }
    }
    collections(first: 100) {
      nodes {
        handle
        updatedAt
      }
    }
    pages(first: 100) {
      nodes {
        handle
        updatedAt
      }
    }
    shop {
      privacyPolicy {
        handle
      }
      refundPolicy {
        handle
      }
      shippingPolicy {
        handle
      }
      termsOfService {
        handle
      }
      subscriptionPolicy {
        handle
      }
    }
  }
`;

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(origin, path, lastmod) {
  const lastmodTag = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : "";
  return `<url><loc>${escapeXml(`${origin}${path}`)}</loc>${lastmodTag}</url>`;
}

function policyHandles(shop) {
  return [
    shop?.privacyPolicy,
    shop?.refundPolicy,
    shop?.shippingPolicy,
    shop?.termsOfService,
    shop?.subscriptionPolicy
  ]
    .map((policy) => policy?.handle)
    .filter(Boolean);
}

export async function loader({ context, request }) {
  const origin = new URL(request.url).origin;
  const urls = [
    urlEntry(origin, "/"),
    urlEntry(origin, "/shop"),
    urlEntry(origin, "/services"),
    urlEntry(origin, "/about"),
    urlEntry(origin, "/collections")
  ];

  try {
    const data = await context.storefront.query(SITEMAP_QUERY, {
      cache: context.storefront.CacheShort()
    });
    for (const collection of data.collections?.nodes || []) {
      urls.push(urlEntry(origin, `/collections/${collection.handle}`, collection.updatedAt));
    }
    for (const product of data.products?.nodes || []) {
      urls.push(urlEntry(origin, `/products/${product.handle}`, product.updatedAt));
    }
    for (const page of data.pages?.nodes || []) {
      urls.push(urlEntry(origin, `/pages/${page.handle}`, page.updatedAt));
    }
    for (const handle of policyHandles(data.shop)) {
      urls.push(urlEntry(origin, `/policies/${handle}`));
    }
  } catch (error) {
    console.error(error);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}

