import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  // Required for Vercel + App Router + route groups
  output: "standalone",

  // Ensure output tracing stays within this repo even if the build environment
  // contains other lockfiles above the project root.
  outputFileTracingRoot: __dirname,

  // Keep your existing build behavior
  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  // Configure webpack to handle native modules (.node files)
  webpack: (config, { isServer }) => {
    // Only apply on server-side builds
    if (isServer) {
      // Externalize native modules - they should not be bundled
      config.externals = config.externals || [];
      config.externals.push({
        '@resvg/resvg-js': 'commonjs @resvg/resvg-js',
      });
    }
    
    return config;
  },

  // Mark packages with native bindings as external
  serverExternalPackages: ['@resvg/resvg-js', 'pdfkit'],
};

export default nextConfig;