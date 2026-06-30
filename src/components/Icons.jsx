export function HeartIcon({ filled = false }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20.4 5.6c-1.7-1.7-4.4-1.7-6.1 0L12 7.9 9.7 5.6C8 3.9 5.3 3.9 3.6 5.6s-1.7 4.4 0 6.1L12 20l8.4-8.3c1.7-1.7 1.7-4.4 0-6.1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function ShoppingBagIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.5 8.5h11l1 11h-13l1-11Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9 8.5V6a3 3 0 0 1 6 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
