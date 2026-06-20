import { Money } from "@shopify/hydrogen";

function sameMoney(left, right) {
  return left?.amount === right?.amount && left?.currencyCode === right?.currencyCode;
}

export default function ProductPrice({ product, price, compareAtPrice }) {
  const activePrice = price || product?.price;
  const activeCompareAt = compareAtPrice || product?.compareAtPrice;

  if (activePrice) {
    return (
      <div className="product-price">
        <Money data={activePrice} />
        {activeCompareAt && Number(activeCompareAt.amount) > Number(activePrice.amount) && (
          <s>
            <Money data={activeCompareAt} />
          </s>
        )}
      </div>
    );
  }

  const min = product?.priceRange?.minVariantPrice;
  const max = product?.priceRange?.maxVariantPrice;
  if (min && max) {
    return (
      <div className="product-price">
        <Money data={min} />
        {!sameMoney(min, max) && (
          <>
            {" - "}
            <Money data={max} />
          </>
        )}
      </div>
    );
  }

  return <div className="product-price">{product?.priceLabel || "Price on request"}</div>;
}
