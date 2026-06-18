import { reactRouter } from "@react-router/dev/vite";
import { hydrogen } from "@shopify/hydrogen/vite";
import { oxygen } from "@shopify/mini-oxygen/vite";
import { defineConfig, loadEnv } from "vite";

const FRONTEND_ENV_KEYS = [
  "SESSION_SECRET",
  "PUBLIC_STORE_DOMAIN",
  "PUBLIC_STOREFRONT_API_TOKEN",
  "PUBLIC_STOREFRONT_API_VERSION",
  "PUBLIC_STOREFRONT_ID",
  "PUBLIC_CHECKOUT_DOMAIN",
  "PUBLIC_SHOP_COLLECTION_HANDLE",
  "PUBLIC_STAFF_API_BASE_URL"
];

function frontendEnv(mode) {
  const source = loadEnv(mode, process.cwd(), "");
  return Object.fromEntries(FRONTEND_ENV_KEYS.flatMap((key) => (source[key] ? [[key, source[key]]] : [])));
}

export default defineConfig(({ mode }) => ({
  plugins: [hydrogen(), oxygen({ env: frontendEnv(mode) }), reactRouter()],
  resolve: {
    tsconfigPaths: true
  },
  build: {
    assetsInlineLimit: 0
  },
  ssr: {
    optimizeDeps: {
      include: ["react-router > set-cookie-parser", "react-router > cookie", "react-router"]
    }
  },
  server: {
    allowedHosts: [".tryhydrogen.dev"]
  }
}));
