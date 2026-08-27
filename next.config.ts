import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      exceljs$: "exceljs/dist/exceljs.min.js",
    };
    return config;
  },
};

export default nextConfig;
