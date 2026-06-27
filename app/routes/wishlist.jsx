import SavedProductsPage from "../../src/pages/SavedProductsPage";

export const meta = () => [{ title: "Wishlist | Light + Form" }];

export default function WishlistRoute() {
  return (
    <SavedProductsPage
      listName="wishlist"
      title="Saved pieces."
      kicker="Wishlist"
      emptyCopy="No saved products yet."
    />
  );
}
