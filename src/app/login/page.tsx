import { redirect } from "next/navigation";
import { currentRole } from "@/lib/auth";
import LoginScreen from "@/components/LoginScreen";
export default async function LoginPage() {
  const role = await currentRole();
  if (role) redirect(`/${role}`);
  return <LoginScreen />;
}
