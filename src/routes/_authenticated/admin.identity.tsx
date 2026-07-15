import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LucasAvatar } from "@/components/LucasBrand";
import { APP_SETTINGS_QUERY_KEY, useAppSettings } from "@/lib/use-app-settings";
import { Upload, Trash2, RotateCcw, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/identity")({
  component: AdminIdentityPage,
});

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 512;
const BUCKET = "brand-assets";
const OBJECT_PATH = "brand/lucas-avatar.webp";

async function getCroppedWebpBlob(imageSrc: string, cropPixels: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não disponível");
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem"))),
      "image/webp",
      0.9,
    );
  });
}

function AdminIdentityPage() {
  const { data: settings } = useAppSettings();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Formato inválido. Use JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("A imagem deve ter no máximo 5 MB.");
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!sourceUrl || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedWebpBlob(sourceUrl, croppedAreaPixels);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(OBJECT_PATH, blob, {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(OBJECT_PATH, 60 * 60 * 24 * 365 * 5);
      if (signErr) throw signErr;
      const finalUrl = `${signed.signedUrl}&v=${Date.now()}`;

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      const { error: updateErr } = await supabase
        .from("app_settings")
        .update({ lucas_avatar_url: finalUrl, updated_by: uid })
        .eq("singleton", true);
      if (updateErr) throw updateErr;

      toast.success("Foto do Fred atualizada.");
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      setSourceUrl(null);
      setCroppedAreaPixels(null);
      qc.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha ao salvar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelCrop = () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    setCroppedAreaPixels(null);
  };

  const handleRemove = async () => {
    if (!settings?.lucas_avatar_url) return;
    if (!confirm("Remover a foto atual e voltar ao padrão?")) return;
    setRemoving(true);
    try {
      await supabase.storage.from(BUCKET).remove([OBJECT_PATH]);
      const { error } = await supabase
        .from("app_settings")
        .update({ lucas_avatar_url: null })
        .eq("singleton", true);
      if (error) throw error;
      toast.success("Foto removida. Usando o padrão.");
      qc.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha ao remover: ${msg}`);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Identidade visual</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a foto que representa o Fred em toda a plataforma.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <h3 className="mb-4 font-display text-lg font-semibold">Foto do Fred</h3>

        <div className="flex flex-wrap items-center gap-4">
          <LucasAvatar size="lg" className="h-20 w-20 text-2xl" />
          <div className="min-w-[200px] flex-1">
            <div className="text-sm text-muted-foreground">
              {settings?.lucas_avatar_url ? "Imagem personalizada ativa." : "Nenhuma imagem configurada. Usando o fallback (letra L)."}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">JPG, PNG ou WEBP · até 5 MB</div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          onChange={onFileSelected}
          className="hidden"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving || removing}>
            <Upload className="mr-1 size-4" />
            {settings?.lucas_avatar_url ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {settings?.lucas_avatar_url && (
            <Button size="sm" variant="outline" onClick={handleRemove} disabled={saving || removing}>
              {removing ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Trash2 className="mr-1 size-4" />}
              Restaurar padrão
            </Button>
          )}
        </div>
      </section>

      {sourceUrl && (
        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <h3 className="mb-2 font-display text-lg font-semibold">Ajustar recorte</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Arraste para reposicionar e use o zoom. A imagem será salva como quadrado {OUTPUT_SIZE}×{OUTPUT_SIZE} e exibida em formato circular.
          </p>

          <div className="relative h-[300px] w-full overflow-hidden rounded-xl bg-background sm:h-[400px]">
            <Cropper
              image={sourceUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <RotateCcw className="size-4 text-muted-foreground" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Zoom"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || !croppedAreaPixels}>
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              Salvar imagem
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelCrop} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
