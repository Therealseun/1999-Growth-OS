import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const defaultBackendUrl =
      process.env.NODE_ENV === "production"
        ? "https://one999-growth-os.onrender.com"
        : "http://localhost:4000";
    const backendUrl = (process.env.API_URL ?? defaultBackendUrl).replace(/\/$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
