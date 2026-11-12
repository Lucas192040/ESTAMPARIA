import { redirect } from "next/navigation";
import { currentRole } from "@/lib/auth";
import PinturaDashboard from "@/components/PinturaDashboard";
export default async function Page() {
 const role=await currentRole();
 if(!role) redirect("/login");
 if(role!=="pintura") redirect(`/${role}`);
 return <PinturaDashboard/>;
}