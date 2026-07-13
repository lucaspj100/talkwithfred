import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { getMyProfile } from "@/lib/profile.functions";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/_authenticated/admin")({
  loader: async () => {
    const me = await getMyProfile();
    if (!me.isAdmin) {
      toast.error("Você não possui permissão para acessar a área administrativa.");
      throw redirect({ to: "/dashboard" });
    }
    return { me };
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
