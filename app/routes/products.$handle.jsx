import { useLoaderData } from "react-router";
import ProductPage from "../../src/pages/ProductPage";
import { loadProduct } from "../../src/lib/shopifyStorefront";

export async function loader({ context, params, request }) {
  return loadProduct(context, params.handle, request);
}

export const meta = ({ data }) => [{ title: data?.title ? `${data.title} | Light + Form` : "Light + Form" }];

export default function ProductRoute() {
  const data = useLoaderData();
  return <ProductPage {...data} />;
}
