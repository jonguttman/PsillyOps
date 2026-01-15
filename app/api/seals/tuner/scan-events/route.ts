/**
 * Seal Tuner Scan Events API (Server-Sent Events)
 * 
 * Provides real-time feedback when a tuner preview seal is scanned.
 * 
 * The /seal/TUNER_PREVIEW_001 page will POST to /api/seals/tuner/scan-notify
 * when scanned, and this SSE endpoint will broadcast to connected clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getEventQueue } from '@/lib/services/scanEventService';

export async function GET(request: NextRequest) {
  // Require authentication
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const userRole = session.user.role;
  if (userRole !== 'ADMIN' && userRole !== 'WAREHOUSE') {
    return NextResponse.json(
      { error: 'Forbidden: ADMIN or WAREHOUSE role required' },
      { status: 403 }
    );
  }
  
  // Create SSE stream
  const encoder = new TextEncoder();
  let lastEventCount = 0;
  const eventQueue = getEventQueue();
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`));
      
      // Poll for new events every 500ms
      const interval = setInterval(() => {
        const currentCount = eventQueue.length;
        
        if (currentCount > lastEventCount) {
          // New events available
          const newEvents = eventQueue.slice(0, currentCount - lastEventCount);
          for (const event of newEvents.reverse()) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'scan', ...event })}\n\n`));
          }
          lastEventCount = currentCount;
        }
        
        // Send heartbeat every 30 seconds
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 500);
      
      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
