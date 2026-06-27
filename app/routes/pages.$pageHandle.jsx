import { useLoaderData } from "react-router";

const PAGE_QUERY = `#graphql
  query Page($handle: String!) {
    page(handle: $handle) {
      id
      title
      handle
      body
      seo {
        title
        description
      }
    }
  }
`;

export const meta = ({ data }) => [
  { title: `${data?.page?.seo?.title || data?.page?.title || "Page"} | Light + Form` },
  ...(data?.page?.seo?.description ? [{ name: "description", content: data.page.seo.description }] : [])
];

export async function loader({ context, params }) {
  const data = await context.storefront.query(PAGE_QUERY, {
    cache: context.storefront.CacheShort(),
    variables: { handle: params.pageHandle }
  });
  if (!data.page) throw new Response(null, { status: 404 });
  return data;
}

export default function PageRoute() {
  const { page } = useLoaderData();

  return (
    <main>
      <section className="page-hero">
        <div className="site-shell page-hero-grid">
          <div>
            <p className="page-kicker">Page</p>
            <h1>{page.title}</h1>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-shell standard-content" dangerouslySetInnerHTML={{ __html: page.body }} />
      </section>
    </main>
  );
}

