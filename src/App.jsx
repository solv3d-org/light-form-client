import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import SiteLayout from "./components/SiteLayout";
import { catalogMetadata, products } from "./data/products";
import { getInitialTheme, saveManualThemeOverride } from "./lib/theme";
import AboutPage from "./pages/AboutPage";
import HomePage from "./pages/HomePage";
import ServicesPage from "./pages/ServicesPage";
import ShopPage from "./pages/ShopPage";

const pageTitles = {
  "/": "Light + Form | Landing Page",
  "/shop": "Light + Form | Shop",
  "/services": "Light + Form | Our Services",
  "/about": "Light + Form | About Us"
};

function AppRoutes({ theme, onThemeChange }) {
  const location = useLocation();
  const pageTitle = pageTitles[location.pathname] || "Light + Form";

  return (
    <SiteLayout pageTitle={pageTitle}>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              products={products}
              catalogMetadata={catalogMetadata}
              theme={theme}
              onThemeChange={onThemeChange}
            />
          }
        />
        <Route path="/shop" element={<ShopPage products={products} />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </SiteLayout>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    saveManualThemeOverride(nextTheme);
  };

  return (
    <BrowserRouter>
      <AppRoutes theme={theme} onThemeChange={handleThemeChange} />
    </BrowserRouter>
  );
}
