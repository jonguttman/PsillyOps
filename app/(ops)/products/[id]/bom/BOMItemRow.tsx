"use client";

import { useState } from "react";

interface BOMItem {
  id: string;
  quantityPerUnit: number;
  material: {
    id: string;
    name: string;
    sku: string;
    unitOfMeasure: string;
  };
}

interface BOMItemRowProps {
  item: BOMItem;
  productId: string;
  updateAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}

export function BOMItemRow({
  item,
  productId,
  updateAction,
  removeAction,
}: BOMItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [quantity, setQuantity] = useState(item.quantityPerUnit.toString());

  const handleUpdate = async (formData: FormData) => {
    await updateAction(formData);
    setIsEditing(false);
  };

  const handleRemove = async (formData: FormData) => {
    if (confirm(`Remove ${item.material.name} from BOM?`)) {
      await removeAction(formData);
    }
  };

  return (
    <tr>
      <td className="py-3 text-sm text-gray-900">{item.material.name}</td>
      <td className="py-3 text-sm text-gray-500">{item.material.sku}</td>
      <td className="py-3 text-sm text-gray-500">{item.material.unitOfMeasure}</td>
      <td className="py-3 text-sm text-gray-900 text-right">
        {isEditing ? (
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="0.001"
            step="0.001"
            className="w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-right"
          />
        ) : (
          <span>{item.quantityPerUnit}</span>
        )}
      </td>
      <td className="py-3 text-right">
        {isEditing ? (
          <div className="flex justify-end gap-2">
            <form action={handleUpdate}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="quantityPerUnit" value={quantity} />
              <button
                type="submit"
                className="text-sm text-green-600 hover:text-green-900"
              >
                Save
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setQuantity(item.quantityPerUnit.toString());
                setIsEditing(false);
              }}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-900"
            >
              Edit
            </button>
            <form action={handleRemove}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="productId" value={productId} />
              <button
                type="submit"
                className="text-sm text-red-600 hover:text-red-900"
              >
                Remove
              </button>
            </form>
          </div>
        )}
      </td>
    </tr>
  );
}


