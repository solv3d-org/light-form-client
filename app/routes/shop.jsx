import { useLoaderData } from "react-router";
import ShopPage from "../../src/pages/ShopPage";
import { loadShopCatalog } from "../../src/lib/shopifyStorefront";

export const meta = () => [{ title: "Light + Form | Shop" }];

export async function loader({ context, request }) {
  return loadShopCatalog(context, request);
}

export default function ShopRoute() {
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
