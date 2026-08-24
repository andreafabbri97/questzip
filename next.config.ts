import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  experimental: {
    // L'import IA di una scheda manda al server il PDF (o le foto delle pagine): col limite
    // predefinito di 1 MB falliva SEMPRE, perché una scheda compilata pesa 3-6 MB e una foto da
    // telefono 2-5 MB — e l'errore arrivava dal trasporto, quindi sembrava un guasto dell'IA.
    // 5 MB copre il caso PDF; le foto vengono comunque rimpicciolite nel browser prima di
    // partire (lib/image-downscale.ts), perché su Vercel il tetto per richiesta resta ~4,5 MB.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
