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
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      // /campagne resta raggiungibile anche senza login: è lei stessa a mostrare il
      // prompt "Accedi con Google" (è anche la pagina di signIn configurata sotto).
      if (nextUrl.pathname === "/campagne") return true;
      return Boolean(auth?.user);
    },
  },
});
