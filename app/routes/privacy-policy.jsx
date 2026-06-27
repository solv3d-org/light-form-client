import PolicyPage from "../../src/pages/PolicyPage";

export const meta = () => [{ title: "Privacy Policy | Light + Form" }];

export default function PrivacyRoute() {
  return <PolicyPage policyHandle="privacy-policy" />;
}
