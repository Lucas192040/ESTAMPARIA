import { redirect } from "next/navigation";
import { currentRole } from "@/lib/auth";
export default async function Page() {
  const role = await currentRole();
  redirect(role ? `/${role}` : "/login");
}
