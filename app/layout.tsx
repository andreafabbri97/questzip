import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { AuthSessionProvider } from "@/components/session-provider";
import { RealtimeProvider } from "@/components/realtime-provider";
import { PwaInstallProvider } from "@/components/pwa-install-provider";
import { UnsavedChangesProvider } from "@/components/unsaved-changes-provider";
import { OfflineSupport } from "@/components/offline-support";
import { getTemaUtente } from "@/app/actions/tema";

const display = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "QuestZip",
    template: "%s · QuestZip",
  },
  description:
    "Gestore di campagne D&D 5e per master e giocatori: dadi, schede personaggio e note di sessione.",
  applicationName: "QuestZip",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "QuestZip",
  },
};

// Dinamico e non costante: la barra di sistema del telefono (e la splash della PWA) usa questo
// colore, e con un valore fisso scuro chi sceglie il tema chiaro si ritrova una fascia nera
// sopra una pagina di pergamena.
export async function generateViewport(): Promise<Viewport> {
  const tema = await getTemaUtente();
  return {
    themeColor: tema === "chiaro" ? "#f6f1e7" : "#0c0a09",
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Letto dal server e messo sull'<html> prima che la pagina raggiunga il browser: e' quello che
  // evita il lampo scuro al caricamento per chi usa il tema chiaro. Una preferenza salvata solo
  // nel browser non potrebbe farlo, perche' il primo render avverrebbe comunque col tema di
  // default e solo dopo verrebbe corretto da JavaScript.
  const tema = await getTemaUtente();
  return (
    <html
      lang="it"
      data-theme={tema}
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaInstallProvider>
          <AuthSessionProvider>
            <RealtimeProvider>
              <UnsavedChangesProvider>
                <OfflineSupport />
                <Nav />
                <main className="flex-1 w-full max-w-5xl 2xl:max-w-[1600px] [@media(min-width:2200px)]:max-w-[2200px] mx-auto px-4 pb-24 pt-6 sm:pb-10">
                  {children}
                </main>
              </UnsavedChangesProvider>
            </RealtimeProvider>
          </AuthSessionProvider>
        </PwaInstallProvider>
      </body>
    </html>
  );
}
