import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import SiteLayout from "./components/SiteLayout";
import { getInitialTheme, saveManualThemeOverride } from "./lib/theme";
import { isShopifyConfigured } from "./lib/shopifyConfig";
import { fetchShopifyCatalog, getFallbackCatalog } from "./lib/shopifyStorefront";
import AboutPage from "./pages/AboutPage";
import HomePage from "./pages/HomePage";
import ServicesPage from "./pages/ServicesPage";
import ShopPage from "./pages/ShopPage";
import ProductPage from "./pages/ProductPage";

const pageTitles = {
  "/": "Light + Form | Landing Page",
  "/shop": "Light + Form | Shop",
  "/services": "Light + Form | Our Services",
  "/about": "Light + Form | About Us"
};

function AppRoutes({ catalog, catalogStatus, theme, onThemeChange }) {
  const location = useLocation();
  const productHandle = location.pathname.startsWith("/products/") ? location.pathname.split("/").filter(Boolean)[1] : "";
  const activeProduct = productHandle
    ? catalog.products.find((product) => product.handle === productHandle || product.id === productHandle)
    : null;
  const pageTitle = activeProduct
    ? `${activeProduct.title} | Light + Form`
    : pageTitles[location.pathname] || "Light + Form";

  return (
    <SiteLayout pageTitle={pageTitle}>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              products={catalog.products}
              catalogMetadata={catalog.catalogMetadata}
              catalogStatus={catalogStatus}
              theme={theme}
              onThemeChange={onThemeChange}
            />
          }
        />
        <Route
          path="/shop"
          element={
            <ShopPage
              products={catalog.products}
              catalogMetadata={catalog.catalogMetadata}
              catalogStatus={catalogStatus}
            />
          }
        />
        <Route path="/products/:handle" element={<ProductPage products={catalog.products} />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </SiteLayout>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [catalog, setCatalog] = useState(() => getFallbackCatalog());
  const [catalogStatus, setCatalogStatus] = useState(() => (isShopifyConfigured() ? "loading" : "fallback"));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!isShopifyConfigured()) return;

    let cancelled = false;
    setCatalogStatus("loading");

    fetchShopifyCatalog()
      .then((nextCatalog) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setCatalogStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setCatalog(getFallbackCatalog());
        setCatalogStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    saveManualThemeOverride(nextTheme);
  };

  return (
    <BrowserRouter>
      <CartProvider>
        <AppRoutes
          catalog={catalog}
          catalogStatus={catalogStatus}
          theme={theme}
          onThemeChange={handleThemeChange}
        />
      </CartProvider>
    </BrowserRouter>
  );
}
