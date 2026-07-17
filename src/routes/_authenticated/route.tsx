import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/nav/BottomNav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    if (!data.user.email_confirmed_at) {
      throw redirect({ to: "/confirmar-email", search: { email: data.user.email ?? undefined } });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <>
      {/* Extra bottom padding on mobile so content doesn't hide behind BottomNav */}
      <div className="pb-20 md:pb-0">
        <Outlet />
      </div>
      <BottomNav />
    </>
  );
}
