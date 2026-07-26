/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Actions verify the request origin by default, which is what
  // guards them against CSRF. Do not re-add allowedOrigins: ['*'] — it
  // turns that check off and lets any site invoke registerAction and the
  // /admin actions from a signed-in visitor's browser. Add specific
  // hostnames here only if you proxy the app behind another domain.
};

module.exports = nextConfig;
