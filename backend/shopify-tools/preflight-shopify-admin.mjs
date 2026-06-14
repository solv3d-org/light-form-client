import { getConfig } from "../src/config.js";
import { shopifyAdminGraphql } from "../src/shopifyAdmin.js";

const PREFLIGHT_QUERY = `
  query ShopifyAdminPreflight($locationId: ID!) {
    __schema {
      mutationType {
        fields {
          name
          args {
            name
          }
        }
      }
      directives {
        name
        args {
          name
        }
      }
    }
    productCreateInput: __type(name: "ProductCreateInput") {
      inputFields {
        name
      }
    }
    productUpdateInput: __type(name: "ProductUpdateInput") {
      inputFields {
        name
      }
    }
    productVariantsBulkInput: __type(name: "ProductVariantsBulkInput") {
      inputFields {
        name
      }
    }
    inventorySetQuantitiesInput: __type(name: "InventorySetQuantitiesInput") {
      inputFields {
        name
      }
    }
    location: node(id: $locationId) {
      __typename
      ... on Location {
        id
        name
        isActive
      }
    }
  }
`;

function fieldSet(items = []) {
  return new Set(items.map((item) => item.name));
}

function assertHasFields(label, items, expected) {
  const fields = fieldSet(items);
  const missing = expected.filter((field) => !fields.has(field));
  if (missing.length) throw new Error(`${label} missing: ${missing.join(", ")}`);
}

function assertMutation(schema, name, args) {
  const mutation = schema.mutationType.fields.find((field) => field.name === name);
  if (!mutation) throw new Error(`Mutation missing: ${name}`);
  assertHasFields(`Mutation ${name} args`, mutation.args, args);
}

function assertDirective(schema, name, args) {
  const directive = schema.directives.find((item) => item.name === name);
  if (!directive) throw new Error(`Directive missing: @${name}`);
  assertHasFields(`Directive @${name} args`, directive.args, args);
}

try {
  const config = getConfig();
  if (!config.catalog.shopifyLocationId) throw new Error("SHOPIFY_LOCATION_ID required for live preflight.");

  const data = await shopifyAdminGraphql(config, PREFLIGHT_QUERY, {
    locationId: config.catalog.shopifyLocationId
  });

  assertMutation(data.__schema, "productCreate", ["product"]);
  assertMutation(data.__schema, "productUpdate", ["product"]);
  assertMutation(data.__schema, "productVariantsBulkUpdate", ["productId", "variants"]);
  assertMutation(data.__schema, "inventorySetQuantities", ["input"]);
  assertDirective(data.__schema, "idempotent", ["key"]);
  assertHasFields("ProductCreateInput", data.productCreateInput?.inputFields, ["title", "handle", "descriptionHtml", "vendor", "productType", "tags", "status"]);
  assertHasFields("ProductUpdateInput", data.productUpdateInput?.inputFields, ["id", "title", "handle", "descriptionHtml", "vendor", "productType", "tags", "status"]);
  assertHasFields("ProductVariantsBulkInput", data.productVariantsBulkInput?.inputFields, ["id", "price", "compareAtPrice", "barcode", "inventoryItem"]);
  assertHasFields("InventorySetQuantitiesInput", data.inventorySetQuantitiesInput?.inputFields, ["name", "reason", "referenceDocumentUri", "ignoreCompareQuantity", "quantities"]);

  if (data.location?.__typename !== "Location") throw new Error("SHOPIFY_LOCATION_ID did not resolve to a Location.");
  if (data.location?.isActive === false) throw new Error("SHOPIFY_LOCATION_ID resolves to an inactive Location.");

  console.log(JSON.stringify({
    ok: true,
    shop: config.shopify.storeDomain,
    apiVersion: config.shopify.apiVersion,
    location: {
      id: data.location.id,
      name: data.location.name,
      isActive: data.location.isActive
    }
  }));
} catch (error) {
  console.error(`preflight failed: ${error.message}`);
  process.exit(1);
}
