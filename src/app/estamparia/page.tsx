import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { currentRole } from "@/lib/auth";
export default async function Page() {
  const role = await currentRole();
  if (!role) redirect("/login");
  if (role !== "estamparia") redirect(`/${role}`);
  return <Dashboard mode="estamparia" />;
}
