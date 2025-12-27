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
import prisma from '@/lib/db/prisma';
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
  // #region agent log H1
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiAuth.ts:30',message:'AI auth start',data:{hasAuthHeader:!!req.headers.get('authorization'),hasCookie:!!req.headers.get('cookie')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  const authHeader = req.headers.get('authorization');
  
  // Check for API key authentication
  if (authHeader?.startsWith('Bearer ')) {
    const providedKey = authHeader.substring(7);
    const validKey = process.env.AI_API_KEY;
    const userId = process.env.AI_API_USER_ID;

    // #region agent log H3
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiAuth.ts:42',message:'API key auth attempt',data:{hasValidKey:!!validKey,hasUserId:!!userId,keyMatch:providedKey===validKey},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (!validKey || !userId) {
      return {
        authenticated: false,
        error: 'AI_API_KEY or AI_API_USER_ID not configured in environment',
      };
    }

    if (providedKey !== validKey) {
      // #region agent log H4
      fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiAuth.ts:55',message:'API key mismatch',data:{providedLength:providedKey.length,expectedLength:validKey.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return {
        authenticated: false,
        error: 'Invalid API key',
      };
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // #region agent log H5
    fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiAuth.ts:71',message:'User lookup result',data:{userFound:!!user,userId,userRole:user?.role},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

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

  // #region agent log H2
  fetch('http://127.0.0.1:7242/ingest/37303a4b-08de-4008-8b84-6062b400169a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'aiAuth.ts:101',message:'Both auth methods failed',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  return {
    authenticated: false,
    error: 'No valid authentication provided',
  };
}


