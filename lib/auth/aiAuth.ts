/**
 * AI API Key Authentication
 * 
 * Provides API key authentication for AI clients (ChatGPT, voice assistants)
 * that cannot use browser-based session cookies.
 * 
 * Usage:
 * - Add AI_API_KEY and AI_API_USER_ID to .env
 * - AI clients send: Authorization: Bearer <AI_API_KEY>
 * - System validates and returns user context for RBAC
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { User } from '@prisma/client';

export interface AIAuthResult {
  authenticated: boolean;
  user?: User;
  error?: string;
}

/**
 * Authenticate AI API request using Bearer token
 * Falls back to NextAuth session if no API key provided
 */
export async function authenticateAIRequest(req: NextRequest): Promise<AIAuthResult> {
  const authHeader = req.headers.get('authorization');
  
  // Check for API key authentication
  if (authHeader?.startsWith('Bearer ')) {
    const providedKey = authHeader.substring(7);
    const validKey = process.env.AI_API_KEY;
    const userId = process.env.AI_API_USER_ID;

    if (!validKey || !userId) {
      return {
        authenticated: false,
        error: 'AI_API_KEY or AI_API_USER_ID not configured in environment',
      };
    }

    if (providedKey !== validKey) {
      return {
        authenticated: false,
        error: 'Invalid API key',
      };
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return {
        authenticated: false,
        error: 'AI API user not found in database',
      };
    }

    return {
      authenticated: true,
      user,
    };
  }

  // No API key - try session auth as fallback
  const session = await auth();
  if (session?.user) {
    return {
      authenticated: true,
      user: session.user as User,
    };
  }

  return {
    authenticated: false,
    error: 'No valid authentication provided',
  };
}


