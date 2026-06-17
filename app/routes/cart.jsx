import { CartForm } from "@shopify/hydrogen";
import { data } from "react-router";

export const headers = ({ actionHeaders }) => actionHeaders;

export async function action({ request, context }) {
  if (!context.shopifyConfigured) {
    return data({ cart: null, errors: [{ message: "Shopify Storefront API is not configured." }] }, { status: 400 });
  }

  const formData = await request.formData();
  const { action: cartAction, inputs } = CartForm.getFormInput(formData);
  if (!cartAction) throw new Error("No cart action provided.");

  let result;
  let status = 200;

  switch (cartAction) {
    case CartForm.ACTIONS.Create:
      result = await context.cart.create(inputs);
      break;
    case CartForm.ACTIONS.LinesAdd:
      result = await context.cart.addLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesUpdate:
      result = await context.cart.updateLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesRemove:
      result = await context.cart.removeLines(inputs.lineIds);
      break;
    default:
      throw new Error(`${cartAction} cart action is not defined.`);
  }

  const cartId = result?.cart?.id;
  const headers = cartId ? context.cart.setCartId(cartId) : new Headers();
  const redirectTo = formData.get("redirectTo");

  if (typeof redirectTo === "string") {
    status = 303;
    headers.set("Location", redirectTo);
  }

  return data(
    {
      cart: result?.cart,
      errors: result?.errors,
      warnings: result?.warnings
    },
    { status, headers }
  );
}

export async function loader({ context }) {
  if (!context.shopifyConfigured) return null;
  return context.cart.get();
}

export default function CartRoute() {
  return null;
}
