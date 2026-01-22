/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

module.exports = {
  output: "export",
  trailingSlash: true,          // IMPORTANT for GitHub Pages
  images: { unoptimized: true },
  basePath: isProd ? "/OG_minds_DT" : "",
  assetPrefix: isProd ? "/OG_minds_DT/" : ""
};
