import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { AuthSessionProvider } from "@/components/session-provider";
import { RealtimeProvider } from "@/components/realtime-provider";
import { PwaInstallProvider } from "@/components/pwa-install-provider";
import { UnsavedChangesProvider } from "@/components/unsaved-changes-provider";
import { OfflineSupport } from "@/components/offline-support";

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

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${display.variable} ${body.variable} h-full antialiased`}>
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
