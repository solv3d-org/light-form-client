import { useLoaderData, useOutletContext } from "react-router";
import HomePage from "../../src/pages/HomePage";
import { loadCatalog } from "../../src/lib/shopifyStorefront";

export const meta = () => [{ title: "Light + Form | Landing Page" }];

export async function loader({ context }) {
  return loadCatalog(context);
}

export default function IndexRoute() {
  const catalog = useLoaderData();
  const { theme, onThemeChange } = useOutletContext();

  return (
    <HomePage
      products={catalog.products}
      catalogMetadata={catalog.catalogMetadata}
      catalogStatus={catalog.catalogStatus}
      theme={theme}
      onThemeChange={onThemeChange}
    />
  );
}
