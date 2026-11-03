import { redirect } from "next/navigation";
import { currentRole } from "@/lib/auth";
import MasterDashboard from "@/components/MasterDashboard";
export default async function MasterPage(){
 const role=await currentRole();
 if(!role)redirect("/login");
 if(role!=="master")redirect(`/${role}`);
 return <MasterDashboard/>;
}
