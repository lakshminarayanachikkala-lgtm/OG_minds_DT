/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

module.exports = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },

  // REQUIRED for https://<user>.github.io/OG_minds_DT/
  basePath: isProd ? "/OG_minds_DT" : "",
  assetPrefix: isProd ? "/OG_minds_DT/" : ""
};
