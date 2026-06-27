import { useLoaderData } from "react-router";
import StaffPage from "../../src/pages/StaffPage";
import { configureStaffApiBaseUrl } from "../../src/lib/staffApi";

export const meta = () => [{ title: "Light + Form | Staff IMS" }];

export async function loader({ context }) {
  return { staffApiBaseUrl: context.staffApiBaseUrl || context.env?.PUBLIC_STAFF_API_BASE_URL };
}

export default function StaffRoute() {
  const { staffApiBaseUrl } = useLoaderData();
  configureStaffApiBaseUrl(staffApiBaseUrl);

  return <StaffPage />;
}
