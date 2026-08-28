import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "three",
    "mediabunny",
    "@sparkjsdev/spark",
    "@manycore/aholo-sdk-core",
    "@manycore/aholo-sdk-asset",
    "@manycore/aholo-sdk-world",
    "@manycore/aholo-sdk-lux3d",
  ],
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...(config.module.parser?.javascript ?? {}),
        url: false,
      },
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      exceljs$: "exceljs/dist/exceljs.min.js",
    };
    return config;
  },
};

export default nextConfig;
