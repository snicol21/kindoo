import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '@/lib/password';

const DEFAULT_LICENSE_LEAD_DAYS = 2;
const MAX_LICENSE_LEAD_DAYS = 14;

function normalizeLicenseLeadDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LICENSE_LEAD_DAYS;
  const rounded = Math.round(value as number);
  if (rounded < 0 || rounded > MAX_LICENSE_LEAD_DAYS) return DEFAULT_LICENSE_LEAD_DAYS;
  return rounded;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Credentials provider for email/password
    // In production, hash passwords with bcrypt
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? '');

        if (!email || !password) return null;

        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
        let user = existing[0];

        const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
        const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

        if (!user && bootstrapEmail && bootstrapPassword && email === bootstrapEmail) {
          if (password === bootstrapPassword) {
            const passwordHash = await hashPassword(password);
            user = (
              await db.insert(users).values({ email, name: 'Admin', passwordHash }).returning()
            )[0];
          }
        }

        if (!user?.passwordHash) return null;
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
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
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, user, token }) {
      // Attach user ID to session for server-side filtering
      if (session.user) {
        session.user.id = user?.id ?? (token?.id as string | undefined) ?? session.user.id;

        if (session.user.id) {
          const dbUser = await db
            .select()
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1);
          const currentUser = dbUser[0];
          if (currentUser) {
            session.user.name = currentUser.name ?? null;
            session.user.email = currentUser.email;

            const normalizedLeadDays = normalizeLicenseLeadDays(currentUser.licenseLeadDays);
            if (normalizedLeadDays !== currentUser.licenseLeadDays) {
              await db
                .update(users)
                .set({ licenseLeadDays: normalizedLeadDays })
                .where(eq(users.id, currentUser.id));
            }
          }
        }
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
