export const CART_QUERY_FRAGMENT = `#graphql
  fragment Money on MoneyV2 {
    amount
    currencyCode
  }
  fragment CartLine on CartLine {
    id
    quantity
    cost {
      totalAmount {
        ...Money
      }
    }
    merchandise {
      ... on ProductVariant {
        id
        availableForSale
        title
        sku
        image {
          id
          url
          altText
          width
          height
        }
        price {
          ...Money
        }
        product {
          id
          title
          handle
        }
        selectedOptions {
          name
          value
        }
      }
    }
  }
  fragment CartApiQuery on Cart {
    id
    checkoutUrl
    updatedAt
    totalQuantity
    lines(first: $numCartLines) {
      nodes {
        ...CartLine
      }
    }
    cost {
      subtotalAmount {
        ...Money
      }
      totalAmount {
        ...Money
      }
    }
  }
`;
