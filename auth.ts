import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/campagne",
    // La pagina di errore predefinita di NextAuth è in inglese e dà la colpa alla "server
    // configuration" anche quando il problema è che il database non risponde: vedi
    // app/errore-accesso/page.tsx.
    error: "/errore-accesso",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      // /campagne resta raggiungibile anche senza login: è lei stessa a mostrare il
      // prompt "Accedi con Google" (è anche la pagina di signIn configurata sotto).
      // /errore-accesso deve esserlo per forza: ci si finisce proprio quando l'accesso non è
      // riuscito, e proteggerla creerebbe un rimbalzo senza uscita.
      if (nextUrl.pathname === "/campagne" || nextUrl.pathname === "/errore-accesso") return true;
      return Boolean(auth?.user);
    },
  },
});
