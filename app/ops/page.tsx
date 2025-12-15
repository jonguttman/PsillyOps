export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

export default function OpsIndexPage() {
  redirect("/dashboard");
}
