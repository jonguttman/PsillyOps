"use client";

interface ArchiveButtonProps {
  productId: string;
  archiveAction: (formData: FormData) => Promise<void>;
}

export function ArchiveButton({ productId, archiveAction }: ArchiveButtonProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!confirm("Are you sure you want to archive this product?")) {
      e.preventDefault();
    }
  };

  return (
    <form action={archiveAction} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={productId} />
      <button
        type="submit"
        className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
      >
        Archive
      </button>
    </form>
  );
}
