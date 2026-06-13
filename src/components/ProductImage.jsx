import { useEffect, useState } from "react";
import { getCutoutSource } from "../lib/cutout";

export default function ProductImage({ src, alt }) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [isCutout, setIsCutout] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setDisplaySrc(src);
    setIsCutout(false);

    getCutoutSource(src).then((cutoutSrc) => {
      if (cancelled || !cutoutSrc) return;
      setDisplaySrc(cutoutSrc);
      setIsCutout(true);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <img
      src={displaySrc}
      alt={alt || ""}
      loading="lazy"
      className={isCutout ? "is-cutout-image" : undefined}
    />
  );
}
