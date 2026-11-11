import { redirect } from "next/navigation";
import { currentRole } from "@/lib/auth";
import SoldaDashboard from "@/components/SoldaDashboard";
export default async function Page(){const role=await currentRole();if(!role)redirect("/login");if(role!=="solda")redirect(`/${role}`);return <SoldaDashboard/>;}