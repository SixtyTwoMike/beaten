import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/components/Dashboard";
import { Landing } from "@/components/Landing";

// "/" is the dashboard when signed in and the public landing page otherwise,
// so it lives outside the (app) group, whose layout requires sign-in.

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    const user = session.user as SessionUser;
    return (
      <AppShell user={user}>
        <Dashboard user={user} />
      </AppShell>
    );
  }
  return <Landing />;
}
