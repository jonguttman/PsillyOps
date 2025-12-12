"use client";

interface SetPreferredButtonProps {
  materialId: string;
  vendorId: string;
  action: (formData: FormData) => Promise<void>;
}

export function SetPreferredButton({ materialId, vendorId, action }: SetPreferredButtonProps) {
  return (
    <form action={action}>
      <input type="hidden" name="materialId" value={materialId} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <button
        type="submit"
        className="text-xs text-blue-600 hover:text-blue-900"
      >
        Set as Preferred
      </button>
    </form>
  );
}

