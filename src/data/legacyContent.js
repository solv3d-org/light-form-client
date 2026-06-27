export const contactDetails = {
  email: "eSupport@light-pro.com",
  phone: "+65 6898 2555",
  fax: "+65 6898 4555",
  address: "341 Balestier Road #01-02, Singapore 329773"
};

const legacyUploadPrefix = "https://light-pro.com/wp-content/uploads/";

export function legacyMediaUrl(url) {
  if (!url?.startsWith(legacyUploadPrefix)) return url;
  return `/legacy-media/${url.slice(legacyUploadPrefix.length)}`;
}

export const legacyProductCategories = [
  { handle: "downlight", title: "Downlight" },
  { handle: "ceiling-light", title: "Ceiling light" },
  { handle: "wall-light", title: "Wall light" },
  { handle: "outdoor-light", title: "Outdoor light" },
  { handle: "hanging-light", title: "Hanging light" },
  { handle: "standing-light", title: "Standing light" },
  { handle: "magnetic-track-light", title: "Magnetic track light" },
  { handle: "table-light", title: "Table light" },
  { handle: "schonbek", title: "Schonbek" },
  { handle: "crystal-palace", title: "Crystal Palace" },
  { handle: "furniture", title: "Furniture" },
  { handle: "haiku-fan", title: "Haiku fan" },
  { handle: "home-accessory", title: "Home accessory" },
  { handle: "brand-van-egmond", title: "Brand van Egmond" },
  { handle: "italamp", title: "Italamp" }
];

export const legacyBrands = [
  {
    name: "Siru",
    image: "https://light-pro.com/wp-content/uploads/2024/09/LogoH85.png"
  },
  {
    name: "Innolux",
    image: "https://light-pro.com/wp-content/uploads/2020/08/Innolux_logo_black-1.png"
  },
  {
    name: "Possoni",
    image: "https://light-pro.com/wp-content/uploads/2020/03/possoni.png"
  },
  {
    name: "Innermost",
    image: "https://light-pro.com/wp-content/uploads/2020/08/innermost-Logo-1.png"
  },
  {
    name: "Schonbek",
    image: "https://light-pro.com/wp-content/uploads/2020/08/SL-SWAROVSKI-SCHONBEK-1-1.png"
  },
  {
    name: "Italamp",
    image: "https://light-pro.com/wp-content/uploads/2024/10/Italamp-logo_150x120.jpg"
  },
  {
    name: "Brand van Egmond",
    image: "https://light-pro.com/wp-content/uploads/2024/10/logo-BRAND-VAN-EGMOND_120x120.png"
  },
  {
    name: "Big Ass Fans",
    image: "https://light-pro.com/wp-content/uploads/2024/10/BAF_LOGO_Vert_2Cspot.111X120.png"
  },
  {
    name: "David Trubridge",
    image: "https://light-pro.com/wp-content/uploads/2020/08/davidtrubridge_logotype_black-2-e1727251736521.png"
  },
  {
    name: "Swarovski Lighting",
    image: "https://light-pro.com/wp-content/uploads/2020/08/SL-SWAROVSKI-SCHONBEK-1-1.png"
  }
];

export const legacyProjects = [
  {
    handle: "apartment-at-hillion-residences",
    title: "Apartment at Hillion Residences",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-Res-6.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-Res-1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-Res-4-e1587952621858-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-Res-5-e1587952653559-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-Res-2-e1587952587870-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-Res-3.jpg"
    ]
  },
  {
    handle: "dbs-asia-hub",
    oldHandle: "15549",
    title: "DBS Asia Hub",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/DBS-Asia-Hub-2-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/DBS-Asia-Hub-3-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/DBS-Asia-Hub-5-2.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/DBS-Asia-Hub-5-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/DBS-Asia-Hub-6-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/DBS-Asia-Hub-1-scaled.jpg"
    ]
  },
  {
    handle: "hillion-mall",
    title: "Hillion Mall",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-1.png",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-2.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hillion-6.png"
    ]
  },
  {
    handle: "hot-tomato-jewel-changi-airport",
    title: "Hot Tomato Jewel Changi Airport",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Hot-Tomato-Jewel-2.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hot-Tomato-Jewel-3A.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Hot-Tomato-Jewel-1.jpeg"
    ]
  },
  {
    handle: "matilda-house-a-treasure-trove",
    title: "Matilda House, A Treasure Trove",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Matilda-House-1-e1587954589627-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Matilda-House-3-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Matilda-House-2-scaled.jpg"
    ]
  },
  {
    handle: "parc-vera",
    title: "Parc Vera",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Parc-Vera-3-e1587954831676-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Parc-Vera-4-e1587954861739-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Parc-Vera-5-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Parc-Vera-6-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Parc-Vera-1b-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Parc-Vera-2-scaled.jpg"
    ]
  },
  {
    handle: "residence-at-chun-tin-road-supply-delivery-and-installation-of-light-fittings",
    title: "Residence at Chun Tin Road",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Chun-Tin-3.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Chun-Tin-4.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Chun-Tin-5.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Chun-Tin-6.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Chun-Tin-1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Chun-Tin-2.jpg"
    ]
  },
  {
    handle: "residence-at-guok-avenue-supply-delivery-and-installation-of-lighting-fittings",
    title: "Residence at Guok Avenue",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Guok-Ave-2.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Guok-Ave-3.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Guok-Ave-1.jpeg"
    ]
  },
  {
    handle: "apartment-at-lennie-hill",
    title: "Apartment at Leonie Hill",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Leonie-Hill-6.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Leonie-Hill-4.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Leonie-Hill-5.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Leonie-Hill-1a.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Leonie-Hill-3a.jpg"
    ]
  },
  {
    handle: "residence-at-seraya-road",
    title: "Residence at Seraya Road",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Seraya-4-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Seraya-5-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Seraya-6-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Seraya-Road-1-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Seraya-1-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Seraya-3-scaled.jpg"
    ]
  },
  {
    handle: "residence-at-tiara",
    title: "Residence at Tiara",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Tiara-1.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Tiara-6.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Tiara-2.jpg"
    ]
  },
  {
    handle: "sales-gallery-parc-vera",
    title: "Sales Gallery, Parc Vera",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/PV5-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/PV6-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/PV4-scaled.jpg"
    ]
  },
  {
    handle: "showflat-parc-vera",
    title: "Showflat, Parc Vera",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/PV2.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/PV3-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/PV1-scaled.jpg"
    ]
  },
  {
    handle: "sim-lian-building",
    title: "Sim Lian Building",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/SL1-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/SL2-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/SL3-scaled.jpg"
    ]
  },
  {
    handle: "star-of-kovan",
    title: "Star of Kovan",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/SOK-1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/SOK-4.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/SOK-5.jpg"
    ]
  },
  {
    handle: "treasure-at-tampines",
    title: "Treasure at Tampines",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-6-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-1-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-2.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-3.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-4-scaled.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-5.jpg"
    ]
  },
  {
    handle: "treasure-crest",
    title: "Treasure Crest",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-Crest-1a.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-Crest-3a.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-Vrest-4a.jpeg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-Crest-2a.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-Crest-5a.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Treasure-Crest-6a.jpg"
    ]
  },
  {
    handle: "vision-exchange",
    title: "Vision Exchange",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/04/Facade-L34.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Vision-Facade-1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/04/Vision2.jpg"
    ]
  },
  {
    handle: "private-residence-at-loyang-view",
    title: "Private Residence at Loyang View",
    images: [
      "https://light-pro.com/wp-content/uploads/2020/11/3af4423c-daad-4759-b0c8-f6b4fa68ce14.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Living.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Edited1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Master.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Edited2.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Common-Bath-1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Edited3-1.jpg",
      "https://light-pro.com/wp-content/uploads/2020/11/Family-Area.jpg"
    ]
  }
];

export const policyPages = {
  "shipping-info": {
    title: "Shipping & Handling",
    kicker: "Shipping",
    sections: [
      {
        title: "Singapore delivery",
        items: [
          "Pre-order items require lead time depending on origin.",
          "Delivery is available in Singapore excluding Jurong Island, offshore islands, military bases, and restricted areas.",
          "Orders below S$300 carry a S$35 delivery fee; orders from S$300 are complimentary.",
          "In-stock items typically ship after payment is received.",
          "Self-collection is available at the Balestier showroom."
        ]
      },
      {
        title: "Access and re-delivery",
        items: [
          "Someone must be available to receive the package.",
          "Re-delivery is chargeable.",
          "Staircase delivery and overseas shipping require separate confirmation."
        ]
      }
    ]
  },
  "terms-of-service": {
    title: "Terms & Conditions",
    kicker: "Terms",
    sections: [
      {
        title: "Pricing and payment",
        items: [
          "Prices are listed in Singapore dollars.",
          "Card, PayNow, and supported local payment methods should be confirmed at checkout."
        ]
      },
      {
        title: "Returns, exchanges, and warranty",
        items: [
          "Items sold are generally not exchangeable or refundable.",
          "Stock unavailability may be resolved by refund or replacement.",
          "Order issues should be raised quickly after delivery.",
          "Lighting fixtures generally carry a carry-in warranty unless the product page states otherwise."
        ]
      }
    ]
  },
  "privacy-policy": {
    title: "Privacy Policy",
    kicker: "Privacy",
    sections: [
      {
        title: "Information collected",
        items: [
          "Device, order, contact, payment, and purchase information may be collected when you use the store or visit the showroom.",
          "Showroom CCTV may be used for safety and security.",
          "Social media interactions may also generate personal information."
        ]
      },
      {
        title: "Use of information",
        items: [
          "Information is used for order fulfilment, communication, fraud screening, and service improvement.",
          "Marketing communication should follow the consent and unsubscribe controls available to the customer."
        ]
      }
    ]
  },
  "refund-policy": {
    title: "Refunds & Replacements",
    kicker: "Returns",
    sections: [
      {
        title: "Default position",
        items: [
          "Items sold are generally not exchangeable or refundable.",
          "Approved exchanges require original packaging, complete parts, and merchantable condition.",
          "Installed, used, tampered, damaged, or incomplete items are not eligible."
        ]
      },
      {
        title: "Order cancellation",
        items: [
          "Accepted cancellations may be subject to restock and administrative fees.",
          "Delivery charges are non-refundable."
        ]
      }
    ]
  }
};
