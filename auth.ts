import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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
  events: {
    /**
     * Riallinea nome e foto a quelli dell'account Google ad ogni accesso.
     *
     * L'adapter scrive questi campi SOLO quando crea l'utente, e non li tocca mai piu': chi si
     * era registrato senza foto sul profilo Google, o l'ha cambiata dopo, restava con il valore
     * del primo giorno per sempre. In app il risultato era che l'icona in alto a destra non
     * compariva affatto, e da telefono quel collegamento e' l'unico modo di aprire il proprio
     * profilo (segnalato da un utente che la foto su Google ce l'aveva eccome).
     *
     * Si scrive solo quando qualcosa e' davvero cambiato: un UPDATE a vuoto ad ogni accesso
     * sarebbe traffico sprecato su un database la cui quota di trasferimento abbiamo gia' finito
     * una volta.
     */
    async signIn({ user, profile }) {
      if (!user.id || !profile) return;
      const immagine = typeof profile.picture === "string" ? profile.picture : null;
      const nome = typeof profile.name === "string" ? profile.name : null;
      const modifiche: { name?: string; image?: string } = {};
      if (nome && nome !== user.name) modifiche.name = nome;
      if (immagine && immagine !== user.image) modifiche.image = immagine;
      if (Object.keys(modifiche).length === 0) return;
      await db.update(users).set(modifiche).where(eq(users.id, user.id));
    },
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
