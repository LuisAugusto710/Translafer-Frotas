import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeleteDespesa } from "@workspace/api-client-react";
import { apiFetch } from "@/lib/api-fetch";
import { Plus, Download, MoreHorizontal, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { exportToCsv, exportToExcel } from "@/lib/export";
import { DespesaFormModal } from "@/components/despesa-form-modal";

// ── Highlight component ──────────────────────────────────────────────────────
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

// ── Types ────────────────────────────────────────────────────────────────────
type DespesaRow = {
  id: number;
  data: string;
  frota: string;
  cidade: string;
  motoristaNome: string;
  ajudanteNome: string;
  frete: number;
  km: number;
  dieselLt: number;
  dieselRs: number;
  das: number;
  motorista: number;
  almoco: number;
  ajudante: number;
  pedagio: number;
  unimed: number;
  seguro: number;
  gasto: number;
  rastreador: number;
  inss: number;
  escritorio: number;
  ipva: number;
  bsoft: number;
  totalDespesa: number;
  lucro: number;
  trocaOleoParcela: string;
  obs: string | null;
};

type DespesaPage = { despesas: DespesaRow[]; total: number };

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100;
const DESPESAS_KEY = "/api/despesas";
const ROW_HEIGHT = 41;
const COL_COUNT = 27;

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchDespesaPage(offset: number): Promise<DespesaPage> {
  const res = await apiFetch(`${DESPESAS_KEY}?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error("Erro ao carregar despesas");
  return res.json();
}

async function searchDespesas(search: string): Promise<DespesaPage> {
  const res = await apiFetch(`${DESPESAS_KEY}?search=${encodeURIComponent(search)}&limit=5000`);
  if (!res.ok) throw new Error("Erro na busca");
  return res.json();
}

async function fetchAllDespesas(search?: string): Promise<DespesaRow[]> {
  const url = search
    ? `${DESPESAS_KEY}?search=${encodeURIComponent(search)}&limit=10000`
    : `${DESPESAS_KEY}?limit=10000`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Erro ao exportar");
  const data: DespesaPage = await res.json();
  return data.despesas;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Despesas() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaRow | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debouncedSearch.length > 0;

  const {
    data: infiniteData,
    isLoading: isPagesLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [DESPESAS_KEY, "pages"],
    queryFn: ({ pageParam }: { pageParam: number }) => fetchDespesaPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.despesas.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !isSearching,
    staleTime: 30_000,
  });

  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    queryKey: [DESPESAS_KEY, "search", debouncedSearch],
    queryFn: () => searchDespesas(debouncedSearch),
    enabled: isSearching,
    staleTime: 30_000,
  });

  const despesas: DespesaRow[] = useMemo(() => {
    if (isSearching) return searchData?.despesas ?? [];
    return infiniteData?.pages.flatMap((p) => p.despesas) ?? [];
  }, [isSearching, searchData, infiniteData]);

  const isLoading = isSearching ? isSearchLoading : isPagesLoading;

  const virtualizer = useVirtualizer({
    count: despesas.length,
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
    if (lastVirtualIndex >= despesas.length - 20) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, despesas.length, hasNextPage, isFetchingNextPage, isSearching, fetchNextPage]);

  const invalidateDespesas = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [DESPESAS_KEY] });
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        q.queryKey[0].startsWith("/api/dashboard"),
    });
  }, [queryClient]);

  const deleteDespesa = useDeleteDespesa();
  const handleDelete = (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    deleteDespesa.mutate({ id }, { onSuccess: invalidateDespesas });
  };

  const handleExportCsv = async () => {
    const rows = await fetchAllDespesas(debouncedSearch || undefined);
    exportToCsv(rows, "despesas_export");
  };
  const handleExportExcel = async () => {
    const rows = await fetchAllDespesas(debouncedSearch || undefined);
    exportToExcel(rows, "despesas_export");
  };

  const hl = useCallback(
    (text: string | null | undefined): React.ReactNode =>
      isSearching
        ? <Highlight text={text ?? ""} query={debouncedSearch} />
        : <>{text ?? ""}</>,
    [isSearching, debouncedSearch]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar despesas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Exportar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={() => { setEditingDespesa(null); setIsFormOpen(true); }}
            className="bg-[#0a192f] hover:bg-[#0a192f]/90 text-white"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nova Entrada</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md flex-1 overflow-hidden flex flex-col bg-card shadow-sm text-sm min-h-0">
        <div ref={scrollRef} className="overflow-auto flex-1">
          <Table className="min-w-[2000px]">
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur">
              <TableRow className="text-xs sm:text-sm">
                <TableHead className="min-w-[90px] whitespace-nowrap">Data</TableHead>
                <TableHead className="min-w-[64px] whitespace-nowrap">Frota</TableHead>
                <TableHead className="min-w-[100px] whitespace-nowrap">Cidade</TableHead>
                <TableHead className="text-right min-w-[88px] whitespace-nowrap">Frete (R$)</TableHead>
                <TableHead className="text-right min-w-[64px] whitespace-nowrap">KM</TableHead>
                <TableHead className="text-right min-w-[82px] leading-tight">Diesel (LT)</TableHead>
                <TableHead className="text-right min-w-[82px] leading-tight">Diesel (R$)</TableHead>
                <TableHead className="text-right min-w-[64px] whitespace-nowrap">DAS</TableHead>
                <TableHead className="min-w-[130px] leading-tight">Motorista (Nome)</TableHead>
                <TableHead className="text-right min-w-[80px] whitespace-nowrap">Motorista</TableHead>
                <TableHead className="text-right min-w-[72px] whitespace-nowrap">Almoço</TableHead>
                <TableHead className="min-w-[120px] leading-tight">Ajudante (Nome)</TableHead>
                <TableHead className="text-right min-w-[80px] whitespace-nowrap">Ajudante</TableHead>
                <TableHead className="text-right min-w-[72px] whitespace-nowrap">Pedágio</TableHead>
                <TableHead className="text-right min-w-[72px] whitespace-nowrap">Unimed</TableHead>
                <TableHead className="text-right min-w-[68px] whitespace-nowrap">Seguro</TableHead>
                <TableHead className="text-right min-w-[64px] whitespace-nowrap">Gasto</TableHead>
                <TableHead className="text-right min-w-[88px] whitespace-nowrap">Rastreador</TableHead>
                <TableHead className="text-right min-w-[60px] whitespace-nowrap">INSS</TableHead>
                <TableHead className="text-right min-w-[80px] whitespace-nowrap">Escritório</TableHead>
                <TableHead className="text-right min-w-[60px] whitespace-nowrap">IPVA</TableHead>
                <TableHead className="text-right min-w-[64px] whitespace-nowrap">Bsoft</TableHead>
                <TableHead className="min-w-[110px] leading-tight">Parcela Troca Óleo</TableHead>
                <TableHead className="text-right font-bold text-red-600 min-w-[100px] leading-tight">Total Despesa</TableHead>
                <TableHead className="text-right font-bold text-[#0a192f] min-w-[80px] leading-tight">Lucro (R$)</TableHead>
                <TableHead className="min-w-[80px] whitespace-nowrap">Obs</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: COL_COUNT }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full min-w-[50px]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : despesas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="text-center h-32 text-muted-foreground">
                    {isSearching ? "Nenhuma despesa encontrada para a busca." : "Nenhuma despesa encontrada."}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {topPadding > 0 && (
                    <TableRow aria-hidden>
                      <TableCell colSpan={COL_COUNT} style={{ height: topPadding, padding: 0 }} />
                    </TableRow>
                  )}

                  {virtualItems.map((vItem) => {
                    const d = despesas[vItem.index];
                    return (
                      <TableRow
                        key={d.id}
                        style={{ height: ROW_HEIGHT }}
                        className="hover:bg-muted/50 transition-colors group"
                      >
                        <TableCell className="whitespace-nowrap">{hl(formatDate(d.data))}</TableCell>
                        <TableCell className="font-medium text-[#0a192f] whitespace-nowrap">{hl(d.frota)}</TableCell>
                        <TableCell className="truncate max-w-[140px]" title={d.cidade}>{hl(d.cidade)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.frete))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatNumber(d.km))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatNumber(d.dieselLt))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.dieselRs))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.das))}</TableCell>
                        <TableCell className="truncate max-w-[140px] whitespace-nowrap" title={d.motoristaNome}>{hl(d.motoristaNome || "-")}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.motorista))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.almoco))}</TableCell>
                        <TableCell className="truncate max-w-[140px] whitespace-nowrap" title={d.ajudanteNome}>{hl(d.ajudanteNome || "-")}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.ajudante))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.pedagio))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.unimed))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.seguro))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.gasto))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.rastreador))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.inss))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.escritorio))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.ipva))}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{hl(formatCurrency(d.bsoft))}</TableCell>
                        <TableCell className="whitespace-nowrap" title={d.trocaOleoParcela}>
                          {hl(d.trocaOleoParcela || "-")}
                        </TableCell>
                        <TableCell className="text-right font-bold text-red-600 bg-red-500/10 whitespace-nowrap">
                          {hl(formatCurrency(d.totalDespesa))}
                        </TableCell>
                        <TableCell className={`text-right font-bold whitespace-nowrap ${d.lucro >= 0 ? "text-[#2ecc71] bg-[#2ecc71]/10" : "text-red-600 bg-red-500/10"}`}>
                          {hl(formatCurrency(d.lucro))}
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]" title={d.obs || ""}>
                          {hl(d.obs || "-")}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditingDespesa(d); setIsFormOpen(true); }}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDelete(d.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {bottomPadding > 0 && (
                    <TableRow aria-hidden>
                      <TableCell colSpan={COL_COUNT} style={{ height: bottomPadding, padding: 0 }} />
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-1.5 border-t py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Carregando mais registros…
          </div>
        )}
      </div>

      <DespesaFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        despesa={editingDespesa}
      />
    </div>
  );
}
