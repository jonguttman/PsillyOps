import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import UserManagementClient from "@/components/admin/UserManagementClient";

export default async function UsersPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/ops/dashboard");
  }

  // Fetch users server-side
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-2">
          Create, update, and manage user accounts
        </p>
      </div>

      <UserManagementClient initialUsers={users} currentUserId={session.user.id} />
    </div>
  );
}

