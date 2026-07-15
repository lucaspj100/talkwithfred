import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { FredBrand } from "@/components/FredBrand";

export const Route = createFileRoute("/_authenticated/practice")({
  component: () => (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <FredBrand linkTo="/dashboard" />
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
      </header>
      <Outlet />
    </div>
  ),
});
