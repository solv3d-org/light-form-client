import { useLoaderData } from "react-router";
import StaffPage from "../../src/pages/StaffPage";
import { configureStaffApiBaseUrl } from "../../src/lib/staffApi";

export const meta = () => [{ title: "Light + Form | Staff IMS" }];

export async function loader({ context }) {
  return { staffApiBaseUrl: context.staffApiBaseUrl };
}

export default function StaffRoute() {
  const { staffApiBaseUrl } = useLoaderData();
  configureStaffApiBaseUrl(staffApiBaseUrl);

  return <StaffPage />;
}
