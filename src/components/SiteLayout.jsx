import { useEffect, useState } from "react";
import { useOptimisticCart } from "@shopify/hydrogen";
import { NavLink, useLocation, useRouteLoaderData } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";
import CartDrawer from "./CartDrawer";

const pages = [
  { id: "home", label: "Home", href: "/" },
  { id: "shop", label: "Shop", href: "/shop" },
  { id: "services", label: "Our Services", href: "/services" },
  { id: "about", label: "About Us", href: "/about" }
];

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Services", href: "/services" },
  { label: "About Us", href: "/about" }
];

function HeaderCartButton() {
  const rootData = useRouteLoaderData("root");
  const cart = useOptimisticCart(rootData?.cart);
  const { openCart } = useCartDrawer();
  if (!rootData?.shopifyConfigured) return null;

  return (
    <button className="cart-toggle" type="button" onClick={openCart}>
      Cart <span>{cart?.totalQuantity || 0}</span>
    </button>
  );
}

export default function SiteLayout({ pageTitle, children }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (pageTitle) document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setIsNavOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className="site-header">
        <div className="site-shell header-shell">
          <NavLink className="brandmark" to="/">
            <span className="brandmark-word">Light + Form</span>
            <span className="brandmark-sub">Lighting & Furnishing</span>
          </NavLink>
          <nav className={`site-nav${isNavOpen ? " is-open" : ""}`} id="site-navigation" aria-label="Primary navigation">
            <ul>
              {pages.map((page) => (
                <li key={page.id}>
                  <NavLink className={({ isActive }) => (isActive ? "is-active" : "")} to={page.href}>
                    {page.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="header-actions">
            <HeaderCartButton />
            <button
              className="nav-toggle"
              type="button"
              aria-expanded={String(isNavOpen)}
              aria-controls="site-navigation"
              onClick={() => setIsNavOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
        </div>
      </header>

      {children}
      <CartDrawer />

      <footer className="site-footer">
        <div className="site-shell footer-shell">
          <div>
            <p className="footer-kicker">Light + Form Concepts</p>
            <p className="footer-copy">
              Showroom-led lighting and furnishing support for homes, hospitality spaces, offices, and apartments.
            </p>
          </div>
          <div>
            <p className="footer-heading">Browse</p>
            <ul className="footer-links">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <NavLink to={link.href}>{link.label}</NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="footer-heading">Contact</p>
            <ul className="footer-meta">
              <li>
                <a href="tel:+6568982555">+65 6898 2555</a>
              </li>
              <li>
                <a href="mailto:eSupport@light-pro.com">eSupport@light-pro.com</a>
              </li>
              <li>341 Balestier Road #01-02, Singapore 329773</li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
