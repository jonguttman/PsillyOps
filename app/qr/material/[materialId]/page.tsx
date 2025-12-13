import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCodeDisplay from "./QRCodeDisplay";

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  RAW_BOTANICAL: "Raw Botanical",
  ACTIVE_INGREDIENT: "Active Ingredient",
  EXCIPIENT: "Excipient",
  FLAVORING: "Flavoring",
  PACKAGING: "Packaging",
  LABEL: "Label",
  SHIPPING: "Shipping",
  OTHER: "Other"
};

export default async function MaterialQRPage({
  params
}: {
  params: Promise<{ materialId: string }>;
}) {
  const paramsResolved = await params;
  const { materialId } = paramsResolved;
  
  const session = await auth();
  const isAuthenticated = !!session?.user;
  const isInternalUser = isAuthenticated && session.user.role !== "REP";
  
  const material = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    include: {
      preferredVendor: {
        select: { id: true, name: true }
      },
      vendors: {
        where: { preferred: true },
        include: {
          vendor: {
            select: { name: true }
          }
        }
      },
      inventory: {
        where: { status: "AVAILABLE" },
        include: {
          location: {
            select: { name: true }
          }
        }
      },
      costHistory: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: {
          vendor: {
            select: { name: true }
          }
        }
      }
    }
  });

  if (!material) {
    notFound();
  }

  // Calculate inventory totals
  const totalOnHand = material.inventory.reduce((sum, i) => sum + i.quantityOnHand, 0);
  const inventoryByLocation = material.inventory.reduce((acc, i) => {
    acc[i.location.name] = (acc[i.location.name] || 0) + i.quantityOnHand;
    return acc;
  }, {} as Record<string, number>);

  // Get preferred vendor info
  const preferredMv = material.vendors[0];
  const currentCost = preferredMv?.lastPrice || null;
  const lastCostUpdate = material.costHistory[0];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-blue-600 text-white py-4 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-sm opacity-80 mb-1">Material</div>
          <h1 className="text-2xl font-bold">{material.name}</h1>
          <div className="flex gap-2 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500 text-white">
              {material.sku}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500 text-white">
              {CATEGORY_LABELS[material.category] || material.category}
            </span>
            {!material.active && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500 text-white">
                Inactive
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {/* QR Code Display */}
        <QRCodeDisplay 
          url={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/qr/material/${materialId}`}
          materialName={material.name}
          userRole={session?.user?.role}
        />
        
        {/* Basic Info */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-400">Unit of Measure</div>
              <div className="text-sm font-medium text-gray-900">{material.unitOfMeasure}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Lead Time</div>
              <div className="text-sm font-medium text-gray-900">{material.leadTimeDays} days</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Reorder Point</div>
              <div className="text-sm font-medium text-gray-900">{material.reorderPoint}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">MOQ</div>
              <div className="text-sm font-medium text-gray-900">{material.moq || "—"}</div>
            </div>
          </div>
          {material.description && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs text-gray-400">Description</div>
              <div className="text-sm text-gray-900 mt-1">{material.description}</div>
            </div>
          )}
        </div>

        {/* Stock Summary - Internal Users Only */}
        {isInternalUser && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Stock Summary</h2>
            <div className="text-3xl font-bold text-gray-900">
              {totalOnHand.toLocaleString()}
              <span className="text-sm font-normal text-gray-500 ml-2">
                {material.unitOfMeasure} on hand
              </span>
            </div>
            {Object.keys(inventoryByLocation).length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-gray-400 mb-2">By Location</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(inventoryByLocation).map(([loc, qty]) => (
                    <div key={loc} className="flex justify-between text-sm">
                      <span className="text-gray-600">{loc}</span>
                      <span className="font-medium text-gray-900">{qty.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Low stock warning */}
            {totalOnHand <= material.reorderPoint && material.reorderPoint > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm text-yellow-800 font-medium">
                    Stock is at or below reorder point
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vendor & Pricing - Internal Users Only */}
        {isInternalUser && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Vendor & Pricing</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Preferred Vendor</span>
                <span className="text-sm font-medium text-gray-900">
                  {material.preferredVendor?.name || "Not set"}
                </span>
              </div>
              {currentCost && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Current Cost</span>
                  <span className="text-lg font-semibold text-gray-900">
                    ${currentCost.toFixed(2)} / {material.unitOfMeasure}
                  </span>
                </div>
              )}
              {lastCostUpdate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Last Updated</span>
                  <span className="text-sm text-gray-500">
                    {new Date(lastCostUpdate.createdAt).toLocaleDateString()}
                    {lastCostUpdate.vendor && ` (${lastCostUpdate.vendor.name})`}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Public View Notice */}
        {!isInternalUser && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Limited View</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  {isAuthenticated
                    ? "Your role does not have access to detailed material information."
                    : "Sign in to view detailed stock levels, pricing, and vendor information."}
                </p>
                {!isAuthenticated && (
                  <Link
                    href="/login"
                    className="inline-flex items-center mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900"
                  >
                    Sign in &rarr;
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Internal Link */}
        {isInternalUser && (
          <div className="text-center pt-4">
            <Link
              href={`/materials/${materialId}`}
              className="inline-flex items-center px-4 py-2 border border-blue-600 text-sm font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50"
            >
              View Full Details &rarr;
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4">
          Material ID: {materialId}
        </div>
      </div>
    </div>
  );
}

