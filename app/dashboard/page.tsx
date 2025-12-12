import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const session = await auth();

  // Not logged in → send to login
  if (!session || !session.user) {
    redirect("/login");
  }

  // Not an admin → send to home
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const navItems = [
    { href: "/products", label: "Products" },
    { href: "/materials", label: "Materials" },
    { href: "/inventory", label: "Inventory" },
    { href: "/orders", label: "Orders" },
    { href: "/vendors", label: "Vendors" },
    { href: "/production", label: "Production" },
    { href: "/purchase-orders", label: "Purchase Orders" },
    { href: "/activity", label: "Activity" },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Welcome back, {session.user.name}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <span className="font-medium text-gray-900">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
