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
    "onnxruntime-web",
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
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
