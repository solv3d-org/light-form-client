import PolicyPage from "../../src/pages/PolicyPage";

export const meta = () => [{ title: "Terms & Conditions | Light + Form" }];

export default function TermsRoute() {
  return <PolicyPage policyHandle="terms-of-service" />;
}
