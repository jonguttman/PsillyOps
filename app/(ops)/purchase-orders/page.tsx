import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function PurchaseOrdersPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
      <p className="text-gray-600">This page will be implemented soon.</p>
    </div>
  );
}
