/**
 * Live Seal Preset API
 * 
 * GET /api/seals/tuner/live
 * Returns the currently live seal preset info (for display on operator pages)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { getLivePresetSummary } from '@/lib/services/sealPresetService';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const livePreset = await getLivePresetSummary();

    return NextResponse.json({
      livePreset,
      hasLivePreset: livePreset !== null,
    });
  } catch (error) {
    console.error('[Live Preset GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live preset' },
      { status: 500 }
    );
  }
}

