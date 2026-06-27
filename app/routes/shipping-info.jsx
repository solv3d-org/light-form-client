import PolicyPage from "../../src/pages/PolicyPage";

export const meta = () => [{ title: "Shipping & Handling | Light + Form" }];

export default function ShippingInfoRoute() {
  return <PolicyPage policyHandle="shipping-info" />;
}
