/**
 * Scan Event Service
 * 
 * In-memory event queue for real-time scan feedback in the Seal Tuner.
 * In production, you'd use Redis pub/sub or similar.
 */

export interface ScanEvent {
  timestamp: string;
  token: string;
  userAgent?: string;
  success: boolean;
}

const eventQueue: ScanEvent[] = [];
const MAX_EVENTS = 50;

/**
 * Add a scan event to the queue
 */
export function addScanEvent(event: ScanEvent): void {
  eventQueue.unshift(event);
  if (eventQueue.length > MAX_EVENTS) {
    eventQueue.pop();
  }
}

/**
 * Get recent scan events
 */
export function getRecentEvents(): ScanEvent[] {
  return eventQueue.slice(0, 10);
}

/**
 * Clear all events
 */
export function clearEvents(): void {
  eventQueue.length = 0;
}

/**
 * Get the current event queue (for SSE streaming)
 */
export function getEventQueue(): ScanEvent[] {
  return eventQueue;
}

