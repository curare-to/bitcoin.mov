/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure static export — no server runtime. All dynamism is client-side
  // (Nostr relay websockets + NIP-07 signing), so this bundles to `out/`
  // and hosts anywhere (GitHub Pages, Netlify, Vercel, Cloudflare, IPFS).
  output: 'export',

  // No image-optimization server exists in a static export, and poster URLs
  // come from arbitrary submitters anyway — serve them as-is via <img>.
  images: { unoptimized: true },

  // Emit `foo/index.html` instead of `foo.html` so routes resolve cleanly
  // on static hosts that don't rewrite extensions.
  trailingSlash: true,

  // Uncomment + set to the repo name when hosting under a GitHub Pages sub-path
  // (e.g. https://user.github.io/bitcoin.mov):
  // basePath: '/bitcoin.mov',
  // assetPrefix: '/bitcoin.mov/',
}

export default nextConfig
