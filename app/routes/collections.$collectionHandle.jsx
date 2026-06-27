import { useLoaderData } from "react-router";
import ShopPage from "../../src/pages/ShopPage";
import { loadCollectionCatalog } from "../../src/lib/shopifyStorefront";

export const meta = ({ data }) => [
  { title: `${data?.catalogMetadata?.sourceLabel || "Collection"} | Light + Form` }
];

export async function loader({ context, params, request }) {
  return loadCollectionCatalog(context, request, params.collectionHandle);
}

export default function CollectionRoute() {
  const catalog = useLoaderData();

  return (
    <ShopPage
      products={catalog.products}
      productConnection={catalog.productConnection}
      availableFilters={catalog.availableFilters}
      catalogMetadata={catalog.catalogMetadata}
      catalogStatus={catalog.catalogStatus}
    />
  );
}

