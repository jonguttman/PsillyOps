import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Vercel + App Router + route groups
  output: "standalone",

  // Keep your existing build behavior
  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;