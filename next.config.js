/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: isProd ? "/OG_minds_DT" : "",
  assetPrefix: isProd ? "/OG_minds_DT/" : ""
};

module.exports = nextConfig;
