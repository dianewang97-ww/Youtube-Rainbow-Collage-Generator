import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,

      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.youtubeAccessToken = account.access_token;
      }

      if (account?.expires_at) {
        token.youtubeExpiresAt = account.expires_at;
      }

      return token;
    },

    async session({ session, token }) {
      // Prototype:
      // Make the Google access token available to server-side API routes
      // through auth().
      //
      // The page itself does not read or render this value.
      session.youtubeAccessToken = token.youtubeAccessToken as
        | string
        | undefined;

      return session;
    },
  },

  session: {
    strategy: "jwt",
  },
});