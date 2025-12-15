"use client";

interface DeleteButtonProps {
  materialId: string;
  materialName: string;
  canDelete: boolean;
  deleteReason?: string;
  deleteAction: (formData: FormData) => Promise<void>;
}

export function DeleteButton({ 
  materialId, 
  materialName, 
  canDelete, 
  deleteReason,
  deleteAction 
}: DeleteButtonProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!confirm(
      `⚠️ PERMANENTLY DELETE "${materialName}"?\n\n` +
      `This action CANNOT be undone.\n\n` +
      `The material will be completely removed from the system.\n\n` +
      `Type the material name to confirm deletion.`
    )) {
      e.preventDefault();
      return;
    }

    // Additional confirmation with name check
    const confirmation = prompt(
      `To confirm permanent deletion, type the material name:\n"${materialName}"`
    );

    if (confirmation !== materialName) {
      e.preventDefault();
      alert("Material name did not match. Deletion cancelled.");
    }
  };

  if (!canDelete) {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          disabled
          className="inline-flex items-center px-4 py-2 border border-gray-200 text-sm font-medium rounded-md text-gray-400 bg-gray-100 cursor-not-allowed"
          title={deleteReason || "Cannot delete this material"}
        >
          Delete Permanently
        </button>
        {deleteReason && (
          <div className="absolute z-10 invisible group-hover:visible bottom-full left-0 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-md whitespace-nowrap">
            {deleteReason}
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={deleteAction} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={materialId} />
      <button
        type="submit"
        className="inline-flex items-center px-4 py-2 border border-red-600 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
      >
        Delete Permanently
      </button>
    </form>
  );
}

