import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  assetPrefix: "/compras",
  experimental: {
    serverActions: {
      allowedOrigins: ["kph-os.vercel.app"],
    },
  },
};

export default nextConfig;
