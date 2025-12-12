'use client';

interface SectionFilterProps {
  filters: { id: string; title: string }[];
  selected: string | null;
  onChange: (sectionId: string | null) => void;
}

export default function SectionFilter({ filters, selected, onChange }: SectionFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="section-filter" className="text-sm text-gray-500">
        Jump to:
      </label>
      <select
        id="section-filter"
        value={selected || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="
          block w-48 px-3 py-1.5 text-sm
          border border-gray-300 rounded-md
          bg-white text-gray-700
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          hover:border-gray-400
          cursor-pointer
        "
      >
        <option value="">All Sections</option>
        {filters.map((filter) => (
          <option key={filter.id} value={filter.id}>
            {filter.title}
          </option>
        ))}
      </select>
    </div>
  );
}


