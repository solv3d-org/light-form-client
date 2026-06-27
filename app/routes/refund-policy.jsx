import PolicyPage from "../../src/pages/PolicyPage";

export const meta = () => [{ title: "Refunds & Replacements | Light + Form" }];

export default function RefundRoute() {
  return <PolicyPage policyHandle="refund-policy" />;
}
