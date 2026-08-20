import createNextIntlPlugin from "next-intl/plugin";

const security_headers = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  distDir: process.env.E2E_SKIP_AUTH === "true" ? ".next-e2e" : ".next",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: security_headers,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
