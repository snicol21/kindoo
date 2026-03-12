import { isAdminEmail } from '@/lib/admin';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { users, type UserRole } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

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
              await db
                .insert(users)
                .values({
                  email,
                  name: 'Admin',
                  passwordHash,
                  role: 'admin',
                  ward: '1st Ward',
                  phone: '0000000000',
                })
                .returning()
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
          mustChangePassword: user.mustChangePassword,
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
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnAccount = nextUrl.pathname.startsWith('/account');
      const isOnForcedPasswordPage = nextUrl.pathname.startsWith('/change-password');

      let mustChangePassword = !!auth?.user?.mustChangePassword;

      if (isLoggedIn && auth?.user?.id) {
        const existing = await db
          .select({ mustChangePassword: users.mustChangePassword })
          .from(users)
          .where(eq(users.id, auth.user.id))
          .limit(1);
        const currentUser = existing[0];
        if (currentUser) {
          mustChangePassword = currentUser.mustChangePassword;
        }
      }

      if (isLoggedIn && mustChangePassword && !isOnForcedPasswordPage) {
        return Response.redirect(new URL('/change-password', nextUrl));
      }

      if (isOnDashboard || isOnAdmin || isOnAccount || isOnForcedPasswordPage) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated to sign-in
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.mustChangePassword = user.mustChangePassword;
      }

      if (token.id) {
        const existing = await db
          .select({ mustChangePassword: users.mustChangePassword })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);
        const currentUser = existing[0];
        if (currentUser) {
          token.mustChangePassword = currentUser.mustChangePassword;
        }
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
            session.user.role = (currentUser.role ?? 'ward_user') as UserRole;
            session.user.ward = currentUser.ward;
            session.user.phone = currentUser.phone;
            session.user.image = currentUser.image ?? null;
            session.user.mustChangePassword = currentUser.mustChangePassword;

            if (isAdminEmail(currentUser.email) && currentUser.role !== 'admin') {
              await db.update(users).set({ role: 'admin' }).where(eq(users.id, currentUser.id));
              session.user.role = 'admin';
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
  interface User {
    mustChangePassword?: boolean;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: UserRole;
      ward?: string;
      phone?: string;
      mustChangePassword?: boolean;
    };
  }
}
