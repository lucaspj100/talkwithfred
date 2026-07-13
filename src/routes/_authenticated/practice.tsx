import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/practice")({
  component: () => (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">F</span>
          Speak With Lucas
        </Link>
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
      </header>
      <Outlet />
    </div>
  ),
});
