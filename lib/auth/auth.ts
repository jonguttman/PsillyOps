// NextAuth.js v5 (Auth.js) Configuration

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db/prisma';
import { compare } from 'bcryptjs';
import { UserRole } from '@prisma/client';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('[AUTH] ========================================');
        console.log('[AUTH] Login attempt started');
        console.log('[AUTH] Timestamp:', new Date().toISOString());
        console.log('[AUTH] Email provided:', credentials?.email);
        console.log('[AUTH] Password provided:', !!credentials?.password);
        console.log('[AUTH] Environment:', process.env.NODE_ENV);
        console.log('[AUTH] ========================================');

        try {
          // Step 1: Validate credentials are provided
          if (!credentials?.email || !credentials?.password) {
            console.log('[AUTH] ❌ FAILED: Missing credentials');
            console.log('[AUTH]    - Email missing:', !credentials?.email);
            console.log('[AUTH]    - Password missing:', !credentials?.password);
            return null;
          }

          console.log('[AUTH] ✓ Step 1: Credentials provided');

          // Step 2: Look up user in database
          console.log('[AUTH] Step 2: Looking up user in database...');
          console.log('[AUTH]    - Query: findUnique where email =', credentials.email);
          
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string }
          });

          console.log('[AUTH] Database query completed');
          console.log('[AUTH] User found:', !!user);
          
          if (user) {
            console.log('[AUTH] User details:');
            console.log('[AUTH]    - ID:', user.id);
            console.log('[AUTH]    - Email:', user.email);
            console.log('[AUTH]    - Name:', user.name);
            console.log('[AUTH]    - Role:', user.role);
            console.log('[AUTH]    - Active:', user.active);
            console.log('[AUTH]    - Has password hash:', !!user.password);
            console.log('[AUTH]    - Password hash length:', user.password?.length || 0);
          } else {
            console.log('[AUTH] ❌ FAILED: No user found with email:', credentials.email);
            return null;
          }

          // Step 3: Check if user is active
          if (!user.active) {
            console.log('[AUTH] ❌ FAILED: User exists but is not active');
            return null;
          }

          console.log('[AUTH] ✓ Step 2: User found and is active');

          // Step 4: Compare passwords
          console.log('[AUTH] Step 3: Comparing passwords...');
          console.log('[AUTH]    - Input password length:', (credentials.password as string).length);
          console.log('[AUTH]    - Stored hash starts with:', user.password.substring(0, 10) + '...');
          
          const passwordMatch = await compare(
            credentials.password as string,
            user.password
          );

          console.log('[AUTH] Password comparison result:', passwordMatch);

          if (!passwordMatch) {
            console.log('[AUTH] ❌ FAILED: Password does not match');
            return null;
          }

          console.log('[AUTH] ✓ Step 3: Password matches');

          // Step 5: Return user object
          console.log('[AUTH] ========================================');
          console.log('[AUTH] ✅ LOGIN SUCCESS');
          console.log('[AUTH] Returning user object for:', user.email);
          console.log('[AUTH] ========================================');

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
          };
        } catch (error) {
          console.log('[AUTH] ========================================');
          console.log('[AUTH] ❌ ERROR during authentication');
          console.log('[AUTH] Error type:', error instanceof Error ? error.constructor.name : typeof error);
          console.log('[AUTH] Error message:', error instanceof Error ? error.message : String(error));
          console.log('[AUTH] Error stack:', error instanceof Error ? error.stack : 'N/A');
          console.log('[AUTH] ========================================');
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        console.log('[AUTH] JWT callback - adding user data to token');
        console.log('[AUTH]    - User ID:', user.id);
        console.log('[AUTH]    - User role:', (user as any).role);
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        console.log('[AUTH] Session callback - adding token data to session');
        console.log('[AUTH]    - Token ID:', token.id);
        console.log('[AUTH]    - Token role:', token.role);
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    }
  }
});

// Type augmentation for session
declare module 'next-auth' {
  interface User {
    role: UserRole;
  }
  
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
  }
}
