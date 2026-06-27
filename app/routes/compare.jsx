import SavedProductsPage from "../../src/pages/SavedProductsPage";

export const meta = () => [{ title: "Compare | Light + Form" }];

export default function CompareRoute() {
  return (
    <SavedProductsPage
      listName="compare"
      title="Compare products."
      kicker="Compare"
      emptyCopy="No products selected for comparison."
    />
  );
}
