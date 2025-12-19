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