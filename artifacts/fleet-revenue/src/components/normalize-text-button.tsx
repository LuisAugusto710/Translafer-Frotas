import { useState } from "react";
import { Type } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";

export function NormalizeTextButton() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(() => {
    try { return localStorage.getItem("normalize_done") === "1"; } catch { return false; }
  });
  const { toast } = useToast();

  if (done) return null;

  async function handleNormalize() {
    setRunning(true);
    try {
      const res = await apiFetch("/api/admin/normalize-text", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      try { localStorage.setItem("normalize_done", "1"); } catch { /* ignore */ }
      setDone(true);
      toast({ title: "Normalização concluída", description: "Todos os textos foram padronizados (Title Case)." });
    } catch (err: unknown) {
      toast({
        title: "Erro na normalização",
        description: (err as Error)?.message ?? "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={running}
      onClick={handleNormalize}
      className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
      title="Normalizar capitalização de todos os textos existentes no banco de dados"
    >
      <Type className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{running ? "Normalizando…" : "Normalizar Texto"}</span>
    </Button>
  );
}
