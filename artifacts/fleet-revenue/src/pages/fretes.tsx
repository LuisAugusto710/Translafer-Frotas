import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeleteFrete } from "@workspace/api-client-react";
import { Plus, Download, MoreHorizontal, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter
} from "@/components/ui/table";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { exportToCsv, exportToExcel } from "@/lib/export";
import { FreteFormModal } from "@/components/frete-form-modal";

// ── Types ───────────────────────────────────────────────────────────────────

type FreteRow = {
  id: number;
  dataCte: string;
  dtaFrete: string | null;
  vencimento: string | null;
  origem: string;
  transporte: string | null;
  frota: string;
  transp: string | null;
  cliente: string;
  cidade: string;
  cteNf: string | null;
  obs: string | null;
  peso: number;
  frete: number;
  pedagio: number;
  totalFrete: number;
};

type FretePage = { fretes: FreteRow[]; total: number };

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const FRETES_KEY = "/api/fretes";

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchFretePage(offset: number): Promise<FretePage> {
  const res = await fetch(`${FRETES_KEY}?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error("Erro ao carregar fretes");
  return res.json();
}

async function searchFretes(search: string): Promise<FretePage> {
  const res = await fetch(`${FRETES_KEY}?search=${encodeURIComponent(search)}&limit=5000`);
  if (!res.ok) throw new Error("Erro na busca");
  return res.json();
}

async function fetchAllFretes(search?: string): Promise<FreteRow[]> {
  const url = search
    ? `${FRETES_KEY}?search=${encodeURIComponent(search)}&limit=10000`
    : `${FRETES_KEY}?limit=10000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Erro ao exportar");
  const data: FretePage = await res.json();
  return data.fretes;
}

// ── Component ────────────────────────────────────────────────────────────────

export function Fretes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFrete, setEditingFrete] = useState<FreteRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debouncedSearch.length > 0;

  // ── Mode 1: paginated infinite scroll (no search) ──
  const {
    data: infiniteData,
    isLoading: isPagesLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [FRETES_KEY, "pages"],
    queryFn: ({ pageParam }: { pageParam: number }) => fetchFretePage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.fretes.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !isSearching,
    staleTime: 30_000,
  });

  // ── Mode 2: server-side search (full DB) ──
  const {
    data: searchData,
    isLoading: isSearchLoading,
  } = useQuery({
    queryKey: [FRETES_KEY, "search", debouncedSearch],
    queryFn: () => searchFretes(debouncedSearch),
    enabled: isSearching,
    staleTime: 30_000,
  });

  // ── Derive displayed rows ──
  const fretes: FreteRow[] = useMemo(() => {
    if (isSearching) return searchData?.fretes ?? [];
    return infiniteData?.pages.flatMap((p) => p.fretes) ?? [];
  }, [isSearching, searchData, infiniteData]);

  const totalInDb = isSearching
    ? (searchData?.total ?? 0)
    : (infiniteData?.pages[0]?.total ?? 0);

  const isLoading = isSearching ? isSearchLoading : isPagesLoading;

  // ── Totals (over currently loaded rows) ──
  const totalPeso   = useMemo(() => fretes.reduce((s, f) => s + (f.peso || 0), 0), [fretes]);
  const totalFrete  = useMemo(() => fretes.reduce((s, f) => s + (f.frete || 0), 0), [fretes]);
  const totalPedagio = useMemo(() => fretes.reduce((s, f) => s + (f.pedagio || 0), 0), [fretes]);
  const totalGeral  = useMemo(() => fretes.reduce((s, f) => s + (f.totalFrete || 0), 0), [fretes]);

  // ── Infinite scroll sentinel ──
  const onSentinelVisible = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(onSentinelVisible, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSentinelVisible]);

  // ── CRUD helpers ──
  const invalidateFretes = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [FRETES_KEY] });
    queryClient.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        q.queryKey[0].startsWith("/api/dashboard"),
    });
  }, [queryClient]);

  const deleteFrete = useDeleteFrete();

  const handleDelete = (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este frete?")) return;
    deleteFrete.mutate({ id }, { onSuccess: invalidateFretes });
  };

  // ── Export (always fetches full dataset) ──
  const handleExportCsv = async () => {
    const rows = await fetchAllFretes(debouncedSearch || undefined);
    exportToCsv(rows, "fretes_export");
  };

  const handleExportExcel = async () => {
    const rows = await fetchAllFretes(debouncedSearch || undefined);
    exportToExcel(rows, "fretes_export");
  };

  // ── Misc ──
  const isPastDue = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fretes..."
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
            onClick={() => { setEditingFrete(null); setIsFormOpen(true); }}
            className="bg-[#0a192f] hover:bg-[#0a192f]/90 text-white"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nova Entrada</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md flex-1 overflow-hidden flex flex-col bg-card shadow-sm text-sm min-h-0">
        <div className="overflow-auto flex-1">
          <Table className="min-w-[1100px]">
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur">
              <TableRow>
                <TableHead className="whitespace-nowrap">Data CTE</TableHead>
                <TableHead className="whitespace-nowrap">Origem</TableHead>
                <TableHead className="whitespace-nowrap">Transporte</TableHead>
                <TableHead className="whitespace-nowrap">Frota</TableHead>
                <TableHead className="whitespace-nowrap">Transp</TableHead>
                <TableHead className="whitespace-nowrap">Cliente</TableHead>
                <TableHead className="whitespace-nowrap">Cidade</TableHead>
                <TableHead className="whitespace-nowrap">CTE/NF</TableHead>
                <TableHead className="text-right whitespace-nowrap">Peso (kg)</TableHead>
                <TableHead className="text-right whitespace-nowrap">Frete (R$)</TableHead>
                <TableHead className="text-right whitespace-nowrap">Pedágio (R$)</TableHead>
                <TableHead className="text-right font-bold text-[#0a192f] whitespace-nowrap">Total Frete (R$)</TableHead>
                <TableHead className="whitespace-nowrap">Dta Frete</TableHead>
                <TableHead className="whitespace-nowrap">Vencimento</TableHead>
                <TableHead className="whitespace-nowrap">Obs</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 16 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full min-w-[60px]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : fretes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} className="text-center h-32 text-muted-foreground">
                    {isSearching ? "Nenhum frete encontrado para a busca." : "Nenhum frete encontrado."}
                  </TableCell>
                </TableRow>
              ) : (
                fretes.map((frete) => (
                  <TableRow key={frete.id} className="hover:bg-muted/50 transition-colors group">
                    <TableCell className="whitespace-nowrap">{formatDate(frete.dataCte)}</TableCell>
                    <TableCell className="truncate max-w-[120px]" title={frete.origem}>{frete.origem}</TableCell>
                    <TableCell className="whitespace-nowrap">{frete.transporte}</TableCell>
                    <TableCell className="font-medium text-[#0a192f] whitespace-nowrap">{frete.frota}</TableCell>
                    <TableCell className="whitespace-nowrap">{frete.transp}</TableCell>
                    <TableCell className="truncate max-w-[140px]" title={frete.cliente}>{frete.cliente}</TableCell>
                    <TableCell className="truncate max-w-[110px]" title={frete.cidade}>{frete.cidade}</TableCell>
                    <TableCell className="whitespace-nowrap">{frete.cteNf}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatNumber(frete.peso)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(frete.frete)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(frete.pedagio)}</TableCell>
                    <TableCell className="text-right font-bold text-[#2ecc71] bg-[#2ecc71]/10 whitespace-nowrap">{formatCurrency(frete.totalFrete)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(frete.dtaFrete)}</TableCell>
                    <TableCell className={`whitespace-nowrap font-medium ${isPastDue(frete.vencimento) ? "text-red-600" : ""}`}>
                      {formatDate(frete.vencimento)}
                    </TableCell>
                    <TableCell className="truncate max-w-[100px]" title={frete.obs || ""}>{frete.obs || "-"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingFrete(frete); setIsFormOpen(true); }}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(frete.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {fretes.length > 0 && (
              <TableFooter className="bg-[#0a192f] text-white font-bold sticky bottom-0">
                <TableRow>
                  <TableCell colSpan={8} className="text-right whitespace-nowrap">
                    {!isSearching && hasNextPage
                      ? `${fretes.length.toLocaleString("pt-BR")} de ${totalInDb.toLocaleString("pt-BR")} TOTAIS:`
                      : "TOTAIS:"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatNumber(totalPeso)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatCurrency(totalFrete)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatCurrency(totalPedagio)}</TableCell>
                  <TableCell className="text-right text-[#2ecc71] whitespace-nowrap">{formatCurrency(totalGeral)}</TableCell>
                  <TableCell colSpan={4}></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>

          {/* Infinite scroll sentinel + loading indicator */}
          {!isSearching && (
            <div ref={sentinelRef} className="flex items-center justify-center py-3 text-muted-foreground text-xs">
              {isFetchingNextPage && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando mais...
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <FreteFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        frete={editingFrete}
      />
    </div>
  );
}
