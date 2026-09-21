import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/superadmin",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
