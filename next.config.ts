import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/flyvision/ort/:path*.mjs",
        headers: [
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/flyvision/ort/:path*.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/flyvision/cam/:path*",
        destination: "http://192.168.4.1/:path*",
      },
    ];
  },
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
