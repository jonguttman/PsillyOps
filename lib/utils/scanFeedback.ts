/**
 * Scan Feedback Utilities
 * 
 * Provides haptic and audio feedback for mobile batch binding.
 * 
 * DESIGN PRINCIPLE:
 * Operators must be able to confirm scan outcomes without looking at the screen.
 * 
 * FEEDBACK MAPPING:
 * ┌─────────────────────┬───────────────────────┬──────────────────┬───────────────┐
 * │ Scan Outcome        │ Haptic                │ Audio (optional) │ Scanner State │
 * ├─────────────────────┼───────────────────────┼──────────────────┼───────────────┤
 * │ ✅ Bound            │ 1 short vibration     │ Soft tick        │ Continue      │
 * │ ✅ Already bound    │ 1 short vibration     │ Soft tick        │ Continue      │
 * │ ⚠️ Rebind detected  │ 2 short vibrations    │ Lower chime      │ Pause + modal │
 * │ ❌ Invalid scan     │ None                  │ None             │ Continue      │
 * │ ⛔ Session expired  │ Long vibration        │ Optional alert   │ Stop          │
 * └─────────────────────┴───────────────────────┴──────────────────┴───────────────┘
 * 
 * Haptics are ON by default.
 * Audio is OFF by default (toggleable).
 */

// ============================================
// HAPTIC FEEDBACK (Required)
// ============================================

/**
 * Vibrate for successful bind (1 short pulse)
 * Also used for already_bound (no-op success)
 */
export function vibrateSuccess(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(30);
  }
}

/**
 * Vibrate for rebind detection (2 short pulses)
 */
export function vibrateRebind(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([30, 40, 30]);
  }
}

/**
 * Vibrate for session end/expiry (1 long pulse)
 */
export function vibrateSessionEnd(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(120);
  }
}

/**
 * Vibrate for error (no vibration - silent failure)
 */
export function vibrateError(): void {
  // Intentionally no vibration for errors
  // Invalid scans are silent to avoid confusion
}

// ============================================
// AUDIO FEEDBACK (Optional, Toggleable)
// ============================================

// Audio file paths
const AUDIO_SUCCESS = '/sounds/scan-success.mp3';
const AUDIO_REBIND = '/sounds/scan-rebind.mp3';

// Audio instances (lazy-loaded)
let successAudio: HTMLAudioElement | null = null;
let rebindAudio: HTMLAudioElement | null = null;

/**
 * Initialize audio elements (call once on component mount)
 */
export function initAudio(): void {
  if (typeof window === 'undefined') return;
  
  if (!successAudio) {
    successAudio = new Audio(AUDIO_SUCCESS);
    successAudio.volume = 0.5;
  }
  
  if (!rebindAudio) {
    rebindAudio = new Audio(AUDIO_REBIND);
    rebindAudio.volume = 0.6;
  }
}

/**
 * Play success sound (if enabled)
 */
export function playSuccessSound(enabled: boolean): void {
  if (!enabled) return;
  
  if (typeof window === 'undefined') return;
  
  if (!successAudio) {
    initAudio();
  }
  
  if (successAudio) {
    successAudio.currentTime = 0;
    successAudio.play().catch(() => {
      // Ignore autoplay errors
    });
  }
}

/**
 * Play rebind sound (if enabled)
 */
export function playRebindSound(enabled: boolean): void {
  if (!enabled) return;
  
  if (typeof window === 'undefined') return;
  
  if (!rebindAudio) {
    initAudio();
  }
  
  if (rebindAudio) {
    rebindAudio.currentTime = 0;
    rebindAudio.play().catch(() => {
      // Ignore autoplay errors
    });
  }
}

// ============================================
// COMBINED FEEDBACK HELPERS
// ============================================

export type ScanOutcome = 'bound' | 'already_bound' | 'rebind_required' | 'error' | 'session_expired';

/**
 * Trigger appropriate feedback for a scan outcome
 */
export function triggerScanFeedback(outcome: ScanOutcome, audioEnabled: boolean): void {
  switch (outcome) {
    case 'bound':
    case 'already_bound':
      // Success haptic + optional audio
      // already_bound is treated as success (no-op, no new binding, no scanCount increment)
      vibrateSuccess();
      playSuccessSound(audioEnabled);
      break;
      
    case 'rebind_required':
      // Rebind haptic + optional audio
      vibrateRebind();
      playRebindSound(audioEnabled);
      break;
      
    case 'error':
      // Silent - no feedback
      vibrateError();
      break;
      
    case 'session_expired':
      // Long vibration to signal stop
      vibrateSessionEnd();
      break;
  }
}

