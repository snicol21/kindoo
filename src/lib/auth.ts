import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { users, accounts, sessions, verificationTokens } from '@/schema/schema';
import { eq } from 'drizzle-orm';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    // Optional: Credentials provider for email/password
    // In production, hash passwords with bcrypt
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // TODO: Replace with real password hashing + DB lookup
        // Example only — do NOT use plain-text passwords in production
        if (
          credentials?.email === process.env.DEMO_EMAIL &&
          credentials?.password === process.env.DEMO_PASSWORD
        ) {
          const email = String(credentials.email);
          const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

          const user = existing[0]
            ? existing[0]
            : (await db.insert(users).values({ email, name: 'Demo User' }).returning())[0];

          if (!user) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? 'Demo User',
          };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: process.env.NODE_ENV === 'development' ? 'jwt' : 'database',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated to sign-in
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, user, token }) {
      // Attach user ID to session for server-side filtering
      if (session.user) {
        session.user.id = user?.id ?? (token?.id as string | undefined) ?? session.user.id;
      }
      return session;
    },
  },
  trustHost: true,
});

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
