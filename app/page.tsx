import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  // Not logged in → send to login
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = session.user.role;

  if (role === "REP") {
    redirect("/rep/orders");
  }

  if (role === "WAREHOUSE") {
    redirect("/inventory");
  }

  if (role === "PRODUCTION") {
    redirect("/production");
  }

  if (role === "ADMIN") {
    redirect("/dashboard");
  }

  // fallback
  redirect("/login");
}
