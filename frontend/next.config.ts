import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/voluter',
        destination: '/volunteer',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
