import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three", "@sparkjsdev/spark"],
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
    return config;
  },
};

export default nextConfig;
