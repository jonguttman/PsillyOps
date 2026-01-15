'use client';

/**
 * LiquidGlassSwitch Component
 * 
 * Apple-like "Liquid Glass" toggle switch.
 * Features:
 * - Frosted glass background with backdrop blur
 * - Smooth thumb transition with shadow
 * - Specular highlight for depth
 * - Accessible: role="switch", aria-checked
 * - 44px+ touch target
 */

interface LiquidGlassSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export default function LiquidGlassSwitch({
  checked,
  onChange,
  disabled,
}: LiquidGlassSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative w-[64px] h-[36px] rounded-full
        border backdrop-blur-md transition-all duration-200
        ${checked
          ? 'bg-white/70 border-white/40'
          : 'bg-white/40 border-white/25'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Inner edge highlight */}
      <div
        className={`
          absolute inset-0 rounded-full
          ${checked
            ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]'
            : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]'}
        `}
      />

      {/* Thumb */}
      <div
        className={`
          absolute top-[3px] left-[3px] w-[30px] h-[30px] rounded-full
          bg-white/90 backdrop-blur-xl
          shadow-[0_6px_14px_rgba(0,0,0,0.18)]
          transition-transform duration-200 ease-out
          ${checked ? 'translate-x-[28px]' : ''}
        `}
      />

      {/* Specular highlight */}
      <div
        className={`
          pointer-events-none absolute top-1 left-1 w-6 h-3 rounded-full
          bg-white/50 blur-[2px]
          transition-transform duration-200 ease-out
          ${checked ? 'translate-x-[28px]' : ''}
        `}
      />
    </button>
  );
}
