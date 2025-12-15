import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import NewPurchaseOrderClient from "./NewPurchaseOrderClient";

export default async function NewPurchaseOrderPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  // Only ADMIN and WAREHOUSE can create POs
  if (!['ADMIN', 'WAREHOUSE'].includes(session.user.role)) {
    redirect("/purchase-orders");
  }

  // Fetch vendors and materials for dropdowns
  const [vendors, materials] = await Promise.all([
    prisma.vendor.findMany({
      where: { active: true },
      select: { 
        id: true, 
        name: true,
        defaultLeadTimeDays: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.rawMaterial.findMany({
      where: { active: true },
      select: { 
        id: true, 
        name: true, 
        sku: true, 
        unitOfMeasure: true,
        reorderQuantity: true,
        preferredVendorId: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <NewPurchaseOrderClient
      vendors={vendors}
      materials={materials}
    />
  );
}


