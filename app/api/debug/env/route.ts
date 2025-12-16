// Debug endpoint to check environment variables
// DELETE THIS FILE after debugging

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
    // Also check if it's available on client side
    clientSide: typeof window !== 'undefined' ? 'browser' : 'server'
  });
}

