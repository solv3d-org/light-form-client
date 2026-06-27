export async function loader() {
  throw new Response("Customer account orders are not available yet.", { status: 404 });
}

