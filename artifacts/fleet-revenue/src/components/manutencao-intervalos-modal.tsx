import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X, Settings2 } from "lucide-react";

const CATEGORIAS = [
  "Motor", "Transmissão", "Freios", "Pneus", "Elétrico",
  "Suspensão", "Arrefecimento", "Combustível", "Lubrificação",
  "Funilaria", "Ar Condicionado", "Bateria", "Filtros",
  "Manutenção Geral", "Outro",
] as const;

type Intervalo = {
  id: number;
  categoria: string;
  descricao: string | null;
  intervaloKm: number;
  avisoPercentual: number;
};

const QUERY_KEY = "/api/manutencao-intervalos";

async function fetchIntervalos(): Promise<Intervalo[]> {
  const res = await apiFetch(QUERY_KEY);
  if (!res.ok) throw new Error("Erro ao carregar intervalos");
  return res.json();
}

type EditRow = { categoria: string; descricao: string; intervaloKm: string; avisoPercentual: string };
const EMPTY_ROW: EditRow = { categoria: "", descricao: "", intervaloKm: "10000", avisoPercentual: "20" };

export function ManutencaoIntervalosModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<EditRow>(EMPTY_ROW);
  const [addingNew, setAddingNew] = useState(false);
  const [newRow, setNewRow] = useState<EditRow>(EMPTY_ROW);

  const { data: intervalos = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchIntervalos,
    enabled: open,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [QUERY_KEY] });

  const createMutation = useMutation({
    mutationFn: async (row: EditRow) => {
      const res = await apiFetch(QUERY_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: row.categoria, descricao: row.descricao || null, intervaloKm: Number(row.intervaloKm), avisoPercentual: Number(row.avisoPercentual) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Erro ao salvar"); }
      return res.json();
    },
    onSuccess: () => { invalidate(); setAddingNew(false); setNewRow(EMPTY_ROW); toast({ title: "Intervalo adicionado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, row }: { id: number; row: EditRow }) => {
      const res = await apiFetch(`${QUERY_KEY}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: row.categoria, descricao: row.descricao || null, intervaloKm: Number(row.intervaloKm), avisoPercentual: Number(row.avisoPercentual) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Erro ao salvar"); }
      return res.json();
    },
    onSuccess: () => { invalidate(); setEditingId(null); toast({ title: "Intervalo atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${QUERY_KEY}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => { invalidate(); toast({ title: "Intervalo removido" }); },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" } as any),
  });

  const startEdit = (i: Intervalo) => {
    setEditingId(i.id);
    setEditRow({ categoria: i.categoria, descricao: i.descricao || "", intervaloKm: String(i.intervaloKm), avisoPercentual: String(i.avisoPercentual) });
    setAddingNew(false);
  };

  const usedCategorias = new Set(intervalos.map(i => i.categoria));
  const availableCategorias = CATEGORIAS.filter(c => !usedCategorias.has(c));
  const newAvailable = addingNew ? CATEGORIAS.filter(c => !usedCategorias.has(c) || c === newRow.categoria) : availableCategorias;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-[#0a192f]" />
            Intervalos de Manutenção Preventiva
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Configure o intervalo em km para cada categoria. Usado para calcular alertas no Dashboard.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left font-semibold text-muted-foreground">Categoria</th>
 <th className="pb-2 font-semibold text-muted-foreground pr-2">Intervalo (km)</th>
 <th className="pb-2 font-semibold text-muted-foreground pr-2">Aviso (%)</th>
                  <th className="pb-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {intervalos.map(i => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-muted/20">
                    {editingId === i.id ? (
                      <>
                        <td className="py-1.5 pr-2">
                          <Select value={editRow.categoria} onValueChange={v => setEditRow(p => ({ ...p, categoria: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-52">
                              <SelectItem value={i.categoria}>{i.categoria}</SelectItem>
                              {availableCategorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input type="number" min="1" className="h-8 text-xs text-right" value={editRow.intervaloKm}
                            onChange={e => setEditRow(p => ({ ...p, intervaloKm: e.target.value }))} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input type="number" min="1" max="100" className="h-8 text-xs text-right" value={editRow.avisoPercentual}
                            onChange={e => setEditRow(p => ({ ...p, avisoPercentual: e.target.value }))} />
                        </td>
 <td className="py-1.5">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
                              onClick={() => updateMutation.mutate({ id: i.id, row: editRow })}
                              disabled={updateMutation.isPending}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 font-medium">{i.categoria}</td>
 <td className="py-2 pr-2 text-muted-foreground">{i.intervaloKm.toLocaleString("pt-BR")} km</td>
 <td className="py-2 pr-2 text-muted-foreground">{i.avisoPercentual}%</td>
 <td className="py-2">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(i)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                              onClick={() => { if (confirm(`Excluir intervalo "${i.categoria}"?`)) deleteMutation.mutate(i.id); }}
                              disabled={deleteMutation.isPending}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {/* Add new row */}
                {addingNew && (
                  <tr className="border-b bg-muted/10">
                    <td className="py-1.5 pr-2">
                      <Select value={newRow.categoria} onValueChange={v => setNewRow(p => ({ ...p, categoria: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria…" /></SelectTrigger>
                        <SelectContent className="max-h-52">
                          {newAvailable.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="number" min="1" className="h-8 text-xs text-right" placeholder="km"
                        value={newRow.intervaloKm} onChange={e => setNewRow(p => ({ ...p, intervaloKm: e.target.value }))} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input type="number" min="1" max="100" className="h-8 text-xs text-right" placeholder="%"
                        value={newRow.avisoPercentual} onChange={e => setNewRow(p => ({ ...p, avisoPercentual: e.target.value }))} />
                    </td>
 <td className="py-1.5">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
                          onClick={() => { if (newRow.categoria && newRow.intervaloKm) createMutation.mutate(newRow); }}
                          disabled={createMutation.isPending || !newRow.categoria}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAddingNew(false); setNewRow(EMPTY_ROW); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {!isLoading && newAvailable.length > 0 && !addingNew && (
            <Button variant="outline" size="sm" className="mt-3 gap-1.5 w-full"
              onClick={() => { setAddingNew(true); setEditingId(null); setNewRow(EMPTY_ROW); }}>
              <Plus className="h-4 w-4" /> Adicionar Intervalo
            </Button>
          )}
          {!isLoading && newAvailable.length === 0 && !addingNew && (
            <p className="text-xs text-muted-foreground text-center mt-3">Todos os intervalos de categoria foram configurados.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
