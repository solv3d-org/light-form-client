import { useEffect, useState } from "react";
import { Image } from "@shopify/hydrogen";
import { getCutoutSource } from "../lib/cutout";

export default function ProductImage({ src, alt, image }) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [isCutout, setIsCutout] = useState(false);
  const imageData = image?.url ? { ...image, altText: image.altText || alt || "" } : null;

  useEffect(() => {
    if (imageData) return undefined;
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
  }, [imageData, src]);

  if (imageData) {
    return <Image data={imageData} sizes="(min-width: 900px) 33vw, 90vw" loading="lazy" />;
  }

  if (!src) {
    return (
      <div className="product-image-placeholder" role="img" aria-label={alt || "Product image pending"}>
        <span>Image pending</span>
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt || ""}
      loading="lazy"
      className={isCutout ? "is-cutout-image" : undefined}
    />
  );
}
