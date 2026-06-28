import { useEffect, useState } from "react";
import { useOptimisticCart } from "@shopify/hydrogen";
import { Link, NavLink, useLocation, useRouteLoaderData } from "react-router";
import { useCartDrawer } from "../context/CartDrawerContext";
import { readProductList } from "../lib/localProductLists";
import CartDrawer from "./CartDrawer";
import WishlistDrawer from "./WishlistDrawer";

const pages = [
  { id: "home", label: "Home", href: "/" },
  { id: "shop", label: "Shop", href: "/shop" },
  { id: "gallery", label: "Projects", href: "/gallery" },
  { id: "services", label: "Our Services", href: "/services" },
  { id: "about", label: "About Us", href: "/about" },
  { id: "contact", label: "Contact", href: "/contact" }
];

const staffPages = [
  { id: "orders", label: "Orders", href: "/staff#orders" },
  { id: "checkout", label: "In-Store Checkout", href: "/staff#checkout" },
  { id: "staff-activity", label: "Staff Activity", href: "/staff#staff-activity" },
  { id: "access-management", label: "Access Management", href: "/staff#access-management" }
];

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Projects", href: "/gallery" },
  { label: "Services", href: "/services" },
  { label: "About Us", href: "/about" }
];

const policyLinks = [
  { label: "Shipping", href: "/shipping-info" },
  { label: "Refunds", href: "/refund-policy" },
  { label: "Terms", href: "/terms-of-service" },
  { label: "Privacy", href: "/privacy-policy" }
];

function HeaderCartButton() {
  const rootData = useRouteLoaderData("root");
  const cart = useOptimisticCart(rootData?.cart);
  const { openCart, openWishlist } = useCartDrawer();
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    const sync = () => setWishlistCount(readProductList("wishlist").length);
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("lightform:product-list", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lightform:product-list", sync);
    };
  }, []);

  return (
    <>
      <button className="wishlist-toggle" type="button" onClick={openWishlist}>
        Wishlist <span>{wishlistCount}</span>
      </button>
      {rootData?.shopifyConfigured && (
        <button className="cart-toggle" type="button" onClick={openCart}>
          Cart <span>{cart?.totalQuantity || 0}</span>
        </button>
      )}
    </>
  );
}

export default function SiteLayout({ pageTitle, children }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [staffNavPages, setStaffNavPages] = useState([]);
  const [staffCart, setStaffCart] = useState({ visible: false, count: 0 });
  const location = useLocation();
  const isStaffRoute = location.pathname.startsWith("/staff");
  const navPages = isStaffRoute ? staffNavPages : pages;
  const activeStaffHash = location.hash || "#orders";

  useEffect(() => {
    if (pageTitle) document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setIsNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleStaffNav = (event) => {
      const visibleIds = new Set(event.detail?.visibleTabs || []);
      setStaffNavPages(staffPages.filter((page) => visibleIds.has(page.id)));
    };
    const handleStaffCart = (event) => {
      setStaffCart({ visible: Boolean(event.detail?.visible), count: event.detail?.count || 0 });
    };
    window.addEventListener("lightform:staff-nav", handleStaffNav);
    window.addEventListener("lightform:staff-cart", handleStaffCart);
    return () => {
      window.removeEventListener("lightform:staff-nav", handleStaffNav);
      window.removeEventListener("lightform:staff-cart", handleStaffCart);
    };
  }, []);

  return (
    <>
      <header className={`site-header${isStaffRoute ? " is-staff-header" : ""}`}>
        <div className="site-shell header-shell">
          <NavLink className="brandmark" to="/">
            <span className="brandmark-word">Light + Form</span>
            <span className="brandmark-sub">Lighting & Furnishing</span>
          </NavLink>
          <nav className={`site-nav${isNavOpen ? " is-open" : ""}`} id="site-navigation" aria-label="Primary navigation">
            <ul>
              {navPages.map((page) => (
                <li key={page.id}>
                  {isStaffRoute ? (
                    <Link className={activeStaffHash === `#${page.id}` ? "is-active" : ""} to={page.href}>
                      {page.label}
                    </Link>
                  ) : (
                    <NavLink className={({ isActive }) => (isActive ? "is-active" : "")} to={page.href}>
                      {page.label}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="header-actions">
            {isStaffRoute && staffCart.visible && (
              <button className="cart-toggle" type="button" onClick={() => window.dispatchEvent(new CustomEvent("lightform:staff-cart-open"))}>
                Cart <span>{staffCart.count}</span>
              </button>
            )}
            {isStaffRoute && <div id="staff-header-session"></div>}
            {!isStaffRoute && <HeaderCartButton />}
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
      <WishlistDrawer />
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
            <p className="footer-heading">Policy</p>
            <ul className="footer-links">
              {policyLinks.map((link) => (
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
