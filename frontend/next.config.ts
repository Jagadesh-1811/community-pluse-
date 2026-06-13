import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['leaflet.offline', '@turf/turf'],
  
  async redirects() {
    return [
      {
        source: '/voluter',
        destination: '/volunteer',
        permanent: true,
      },
    ];
  },

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
