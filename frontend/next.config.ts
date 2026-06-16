import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ['leaflet.offline', '@turf/turf'],
  compress: true,
  poweredByHeader: false,

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'leaflet': 'commonjs leaflet',
        'leaflet.offline': 'commonjs leaflet.offline',
      });
    }
    return config;
  },
};

export default nextConfig;
