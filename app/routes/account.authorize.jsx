export async function loader() {
  throw new Response("Customer account authorization is not available yet.", { status: 404 });
}

