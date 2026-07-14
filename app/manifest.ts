import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QuestZip — Gestore campagne D&D 5e",
    short_name: "QuestZip",
    description:
      "Gestore di campagne D&D 5e per master e giocatori: dadi, schede personaggio e note di sessione.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
