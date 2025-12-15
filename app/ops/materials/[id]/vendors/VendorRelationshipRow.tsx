"use client";

import { useState } from "react";
import Link from "next/link";

interface MaterialVendor {
  id: string;
  vendorId: string;
  lastPrice: number | null;
  moq: number;
  leadTimeDays: number | null;
  notes: string | null;
  preferred: boolean;
  vendor: {
    id: string;
    name: string;
  };
}

interface VendorRelationshipRowProps {
  materialVendor: MaterialVendor;
  materialId: string;
  updateAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  setPreferredAction: (formData: FormData) => Promise<void>;
}

export function VendorRelationshipRow({
  materialVendor,
  materialId,
  updateAction,
  removeAction,
  setPreferredAction
}: VendorRelationshipRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleRemove = () => {
    if (!confirm(`Remove ${materialVendor.vendor.name} from this material?`)) {
      return;
    }
    const formData = new FormData();
    formData.set("id", materialVendor.id);
    formData.set("materialId", materialId);
    removeAction(formData);
  };

  if (isEditing) {
    return (
      <tr>
        <td colSpan={7} className="py-3">
          <form
            action={async (formData) => {
              await updateAction(formData);
              setIsEditing(false);
            }}
            className="flex gap-4 items-end flex-wrap"
          >
            <input type="hidden" name="id" value={materialVendor.id} />
            <input type="hidden" name="materialId" value={materialId} />

            <div className="text-sm font-medium text-gray-900">
              {materialVendor.vendor.name}
            </div>

            <div>
              <label className="text-xs text-gray-500">Price</label>
              <input
                type="number"
                name="lastPrice"
                defaultValue={materialVendor.lastPrice || ""}
                min="0"
                step="0.01"
                className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">MOQ</label>
              <input
                type="number"
                name="moq"
                defaultValue={materialVendor.moq}
                min="0"
                step="0.01"
                className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Lead Time</label>
              <input
                type="number"
                name="leadTimeDays"
                defaultValue={materialVendor.leadTimeDays || ""}
                min="0"
                className="block w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div className="flex-1">
              <label className="text-xs text-gray-500">Notes</label>
              <input
                type="text"
                name="notes"
                defaultValue={materialVendor.notes || ""}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="py-2 text-sm">
        <Link
          href={`/vendors/${materialVendor.vendorId}`}
          className="text-blue-600 hover:text-blue-900"
        >
          {materialVendor.vendor.name}
        </Link>
      </td>
      <td className="py-2 text-sm text-gray-900 text-right">
        {materialVendor.lastPrice ? `$${materialVendor.lastPrice.toFixed(2)}` : "—"}
      </td>
      <td className="py-2 text-sm text-gray-900 text-right">
        {materialVendor.moq > 0 ? materialVendor.moq : "—"}
      </td>
      <td className="py-2 text-sm text-gray-900 text-right">
        {materialVendor.leadTimeDays ? `${materialVendor.leadTimeDays} days` : "—"}
      </td>
      <td className="py-2 text-sm text-gray-500">
        {materialVendor.notes || "—"}
      </td>
      <td className="py-2 text-center">
        {materialVendor.preferred ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            Preferred
          </span>
        ) : (
          <form action={setPreferredAction}>
            <input type="hidden" name="materialId" value={materialId} />
            <input type="hidden" name="vendorId" value={materialVendor.vendorId} />
            <button
              type="submit"
              className="text-xs text-blue-600 hover:text-blue-900"
            >
              Set Preferred
            </button>
          </form>
        )}
      </td>
      <td className="py-2 text-right">
        <button
          onClick={() => setIsEditing(true)}
          className="text-sm text-blue-600 hover:text-blue-900 mr-3"
        >
          Edit
        </button>
        <button
          onClick={handleRemove}
          className="text-sm text-red-600 hover:text-red-900"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}


