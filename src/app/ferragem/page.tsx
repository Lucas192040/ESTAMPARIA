import { redirect } from "next/navigation";
import FerragemDashboard from "@/components/FerragemDashboard";
import { currentRole } from "@/lib/auth";
export default async function Page() {
  const role = await currentRole();
  if (!role) redirect("/login");
  if (role !== "ferragem") redirect(`/${role}`);
  return <FerragemDashboard />;
}