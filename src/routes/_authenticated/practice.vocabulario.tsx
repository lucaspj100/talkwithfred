import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyVocabulary, setVocabularyActive, markVocabularyMastered } from "@/lib/training.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Check, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/practice/vocabulario")({
  component: VocabPage,
});

function VocabPage() {
  const list = useServerFn(listMyVocabulary);
  const toggle = useServerFn(setVocabularyActive);
  const markM = useServerFn(markVocabularyMastered);
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);

  const q = useQuery({
    queryKey: ["my-vocabulary", showInactive],
    queryFn: () => list({ data: { limit: 100, includeInactive: showInactive } }),
  });

  async function onToggle(id: string, active: boolean) {
    try { await toggle({ data: { itemId: id, active } }); qc.invalidateQueries({ queryKey: ["my-vocabulary"] }); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function onMaster(id: string) {
    try { await markM({ data: { itemId: id } }); toast.success("Marcado como dominado"); qc.invalidateQueries({ queryKey: ["my-vocabulary"] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  const rows = (q.data ?? []) as Array<{ id: string; original: string; explanation_pt: string | null; mastery_level: number | null; active: boolean | null; mastered_at: string | null }>;

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/practice"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 size-4" />Treinos</Button></Link>
      </header>
      <h1 className="font-display text-2xl font-bold flex items-center gap-2"><BookOpen className="size-6 text-primary" /> Meu vocabulário</h1>
      <p className="mt-1 text-sm text-muted-foreground">Palavras novas que Fred usou com você. Marque como dominadas ou oculte as que você já sabe.</p>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar ocultas
        </label>
      </div>

      {q.isLoading ? (
        <div className="mt-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ainda não há palavras aqui. Converse com Fred e vamos capturar vocabulário novo.
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((v) => (
            <li key={v.id} className="rounded-2xl border border-border bg-card/40 p-3">
              <details className="group">
                <summary className="flex cursor-pointer items-center justify-between gap-2 list-none marker:hidden">
                  <span className="min-w-0 truncate text-sm font-medium lowercase">{v.original.toLowerCase()}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {!v.mastered_at && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); onMaster(v.id); }} title="Já sei essa">
                        <Check className="size-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); onToggle(v.id, !(v.active ?? true)); }} title={v.active === false ? "Reativar" : "Ocultar"}>
                      <EyeOff className="size-4" />
                    </Button>
                  </div>
                </summary>
                {v.explanation_pt && (
                  <p className="mt-2 text-xs text-muted-foreground">{v.explanation_pt}</p>
                )}
                <p className="mt-1 text-[11px] uppercase text-muted-foreground">
                  Nível {v.mastery_level ?? 0}{v.mastered_at ? " · dominada" : ""}{v.active === false ? " · oculta" : ""}
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
