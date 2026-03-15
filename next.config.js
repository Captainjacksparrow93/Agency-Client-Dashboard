/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Skip lint + type-check during Docker build (run these in CI separately)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

module.exports = nextConfig
