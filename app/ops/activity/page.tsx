import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ActivityLogClient from "../../../components/activity/ActivityLogClient";

export default async function ActivityPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  // Users for filter dropdown (feed itself is client-fetched via /api/activity)
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-sm text-gray-600 mt-1">
          Track all operations, changes, and system events across PsillyOps.
        </p>
      </div>

      <ActivityLogClient users={users} />
    </div>
  );
}
