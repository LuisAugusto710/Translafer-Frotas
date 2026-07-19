import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation } from "@tanstack/react-query";
import { deleteManutencao } from "@workspace/api-client-react";
import { apiFetch } from "@/lib/api-fetch";
import { Plus, Download, MoreHorizontal, Pencil, Trash2, Search, Loader2, Paperclip, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToCsv, exportToExcel } from "@/lib/export";
import { ManutencaoFormModal } from "@/components/manutencao-form-modal";
import { ManutencaoIntervalosModal } from "@/components/manutencao-intervalos-modal";
import { useToast } from "@/hooks/use-toast";

// ── Highlight ─────────────────────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200/80 dark:bg-amber-800/60 text-inherit rounded-[2px] not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ManutencaoRow = {
  id: number;
  dataManutencao: string | null;
  frota: string;
  km: number;
  tipo: string;
  procedimento: string;
  categoria: string;
  oficina: string;
  custo: number;
  obs: string | null;
  temAnexo: boolean;
  anexoNome?: string | null;
  anexoTipo?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ManutencaoPage = { manutencoes: ManutencaoRow[]; total: number };

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100;
const KEY = "/api/manutencoes";
const ROW_HEIGHT = 41;

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchPage(offset: number): Promise<ManutencaoPage> {
  const res = await apiFetch(`${KEY}?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error("Erro ao carregar manutenções");
  return res.json();
}

async function searchRows(search: string): Promise<ManutencaoPage> {
  const res = await apiFetch(`${KEY}?search=${encodeURIComponent(search)}&limit=5000`);
  if (!res.ok) throw new Error("Erro na busca");
  return res.json();
}

async function fetchAll(search?: string): Promise<ManutencaoRow[]> {
  const url = search
    ? `${KEY}?search=${encodeURIComponent(search)}&limit=10000`
    : `${KEY}?limit=10000`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Erro ao exportar");
  return ((await res.json()) as ManutencaoPage).manutencoes;
}

// ── Badge helper ──────────────────────────────────────────────────────────────
function tipoBadge(tipo: string) {
  const map: Record<string, string> = {
    Preventiva:  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    Corretiva:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    Emergencial: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${map[tipo] ?? "bg-muted text-muted-foreground"}`}>
      {tipo}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Manutencao() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isIntervalosOpen, setIsIntervalosOpen] = useState(false);
  const [editing, setEditing] = useState<ManutencaoRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debouncedSearch.length > 0;

  // ── Data fetching ──
  const { data: infiniteData, isLoading: isPagesLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: [KEY, "pages"],
      queryFn: ({ pageParam }: { pageParam: number }) => fetchPage(pageParam),
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce((s, p) => s + p.manutencoes.length, 0);
        return loaded < lastPage.total ? loaded : undefined;
      },
      enabled: !isSearching,
      staleTime: 30_000,
    });

  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    queryKey: [KEY, "search", debouncedSearch],
    queryFn: () => searchRows(debouncedSearch),
    enabled: isSearching,
    staleTime: 30_000,
  });

  const rows: ManutencaoRow[] = useMemo(() => {
    if (isSearching) return searchData?.manutencoes ?? [];
    return infiniteData?.pages.flatMap(p => p.manutencoes) ?? [];
  }, [isSearching, searchData, infiniteData]);

  const isLoading = isSearching ? isSearchLoading : isPagesLoading;

  // ── Virtualizer ──
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalVirtualSize = virtualizer.getTotalSize();
  const topPadding = virtualItems[0]?.start ?? 0;
  const bottomPadding = totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0);

  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isSearching) return;
    if (lastVirtualIndex >= rows.length - 20) fetchNextPage();
  }, [lastVirtualIndex, rows.length, hasNextPage, isFetchingNextPage, isSearching, fetchNextPage]);

  // ── CRUD ──
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [KEY] });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteManutencao(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Manutenção excluída com sucesso." });
    },
    onError: (err) => {
      console.error("[Manutencao] Erro ao excluir:", err);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir esta manutenção. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = () => {
    if (pendingDeleteId == null) return;
    deleteMutation.mutate(pendingDeleteId);
    setPendingDeleteId(null);
  };

  // ── Export ──
  const handleExportCsv = async () => {
    const data = await fetchAll(debouncedSearch || undefined);
    const flat = data.map(r => ({
      Data: formatDate(r.dataManutencao ?? ""),
      Frota: r.frota,
      "KM": r.km,
      Tipo: r.tipo,
      Procedimento: r.procedimento,
      Categoria: r.categoria,
      Oficina: r.oficina,
      "Custo (R$)": r.custo,
      Observações: r.obs ?? "",
      Anexo: r.temAnexo ? "Sim" : "Não",
    }));
    exportToCsv(flat, "manutencoes_export");
  };

  const handleExportExcel = async () => {
    const data = await fetchAll(debouncedSearch || undefined);
    const flat = data.map(r => ({
      Data: formatDate(r.dataManutencao ?? ""),
      Frota: r.frota,
      "KM": r.km,
      Tipo: r.tipo,
      Procedimento: r.procedimento,
      Categoria: r.categoria,
      Oficina: r.oficina,
      "Custo (R$)": r.custo,
      Observações: r.obs ?? "",
      Anexo: r.temAnexo ? "Sim" : "Não",
    }));
    exportToExcel(flat, "manutencoes_export");
  };

  // ── Highlight helper ──
  const hl = useCallback(
    (text: string | null | undefined): React.ReactNode =>
      isSearching
        ? <Highlight text={text ?? ""} query={debouncedSearch} />
        : <>{text ?? ""}</>,
    [isSearching, debouncedSearch]
  );

  const totalRows = isSearching
    ? (searchData?.total ?? 0)
    : (infiniteData?.pages[0]?.total ?? 0);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder="Buscar manutenções…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsIntervalosOpen(true)}>
            <Settings2 className="h-4 w-4" />
            <span className="hidden min-[420px]:inline">Intervalos</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
                <span className="hidden min-[420px]:inline">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>Exportar CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>Exportar Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm" className="gap-1.5 bg-[#0a192f] text-white hover:bg-[#0a192f]/90"
            onClick={() => { setEditing(null); setIsFormOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden min-[420px]:inline">Nova Manutenção</span>
            <span className="min-[420px]:hidden">Nova</span>
          </Button>
        </div>
      </div>

      {/* ── Total count ── */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {totalRows.toLocaleString("pt-BR")} {totalRows === 1 ? "registro" : "registros"}
          {isSearching && " encontrados"}
        </p>
      )}

      {/* ── Table ── */}
      <div className="flex-1 rounded-md border overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto" ref={scrollRef} style={{ flex: 1 }}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="whitespace-nowrap">Frota</TableHead>
 <TableHead className="whitespace-nowrap">KM</TableHead>
                <TableHead className="whitespace-nowrap">Tipo</TableHead>
                <TableHead className="whitespace-nowrap">Procedimento</TableHead>
                <TableHead className="whitespace-nowrap">Categoria</TableHead>
                <TableHead className="whitespace-nowrap">Oficina</TableHead>
 <TableHead className="whitespace-nowrap">Custo</TableHead>
 <TableHead className="whitespace-nowrap">Anexo</TableHead>
 <TableHead className="whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
 <TableCell colSpan={10} className=" py-12 text-muted-foreground">
                    {isSearching ? "Nenhum resultado encontrado." : "Nenhuma manutenção registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {topPadding > 0 && (
                    <TableRow><TableCell colSpan={10} style={{ height: topPadding }} /></TableRow>
                  )}
                  {virtualItems.map(vi => {
                    const row = rows[vi.index];
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/40">
                        <TableCell className="whitespace-nowrap text-sm">
                          {hl(formatDate(row.dataManutencao ?? ""))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {hl(row.frota)}
                        </TableCell>
 <TableCell className="whitespace-nowrap text-sm">
                          {row.km.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {tipoBadge(row.tipo)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {hl(row.procedimento)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {hl(row.categoria)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {hl(row.oficina)}
                        </TableCell>
 <TableCell className="whitespace-nowrap font-semibold text-sm">
                          {formatCurrency(row.custo)}
                        </TableCell>
 <TableCell className="">
                          {row.temAnexo && (
                            <span title={row.anexoNome ?? "Anexo"} className="flex justify-center">
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          )}
                        </TableCell>
 <TableCell className="">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditing(row); setIsFormOpen(true); }}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDelete(row.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {bottomPadding > 0 && (
                    <TableRow><TableCell colSpan={10} style={{ height: bottomPadding }} /></TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {isFetchingNextPage && (
          <div className="flex justify-center p-2 border-t bg-card shrink-0">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <ManutencaoFormModal
        open={isFormOpen}
        onOpenChange={(o) => { setIsFormOpen(o); if (!o) setEditing(null); }}
        manutencao={editing ?? undefined}
      />

      <ManutencaoIntervalosModal
        open={isIntervalosOpen}
        onOpenChange={setIsIntervalosOpen}
      />

      <AlertDialog open={pendingDeleteId != null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir manutenção?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro de manutenção será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
