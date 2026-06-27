export const meta = () => [{ title: "Account | Light + Form" }];

export async function loader() {
  throw new Response("Customer accounts are not available yet.", { status: 404 });
}

