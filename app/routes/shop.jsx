import { useLoaderData } from "react-router";
import ShopPage from "../../src/pages/ShopPage";
import { loadCatalog } from "../../src/lib/shopifyStorefront";

export const meta = () => [{ title: "Light + Form | Shop" }];

export async function loader({ context }) {
  return loadCatalog(context);
}

export default function ShopRoute() {
  const catalog = useLoaderData();

  return (
    <ShopPage
      products={catalog.products}
      catalogMetadata={catalog.catalogMetadata}
      catalogStatus={catalog.catalogStatus}
    />
  );
}
