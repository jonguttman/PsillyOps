'use client';

import { LayoutGrid, List, Rows3 } from 'lucide-react';

type ViewMode = 'carousel' | 'grid' | 'list';

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewToggle({ value, onChange }: Props) {
  const options: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { mode: 'carousel', icon: Rows3, label: 'Carousel' },
    { mode: 'grid', icon: LayoutGrid, label: 'Grid' },
    { mode: 'list', icon: List, label: 'List' },
  ];

  return (
    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
      {options.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors
            ${value === mode
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
