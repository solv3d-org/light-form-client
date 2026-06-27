import { useLoaderData } from "react-router";

const POLICIES_QUERY = `#graphql
  query Policies {
    shop {
      privacyPolicy {
        title
        handle
        body
      }
      refundPolicy {
        title
        handle
        body
      }
      shippingPolicy {
        title
        handle
        body
      }
      termsOfService {
        title
        handle
        body
      }
      subscriptionPolicy {
        title
        handle
        body
      }
    }
  }
`;

function policies(shop) {
  return [
    shop?.privacyPolicy,
    shop?.refundPolicy,
    shop?.shippingPolicy,
    shop?.termsOfService,
    shop?.subscriptionPolicy
  ].filter(Boolean);
}

export const meta = ({ data }) => [{ title: `${data?.policy?.title || "Policy"} | Light + Form` }];

export async function loader({ context, params }) {
  const data = await context.storefront.query(POLICIES_QUERY, {
    cache: context.storefront.CacheShort()
  });
  const policy = policies(data.shop).find((item) => item.handle === params.policyHandle);
  if (!policy) throw new Response(null, { status: 404 });
  return { policy };
}

export default function PolicyRoute() {
  const { policy } = useLoaderData();

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">Policy</p>
            <h1>{policy.title}</h1>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-shell standard-content" dangerouslySetInnerHTML={{ __html: policy.body }} />
      </section>
    </main>
  );
}

