import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeleteFrete } from "@workspace/api-client-react";
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
import { FreteFormModal } from "@/components/frete-form-modal";

// ── Highlight component ──────────────────────────────────────────────────────
// Wraps the first matching occurrence of `query` inside the displayed text
// with a subtle amber highlight. Case-insensitive, partial-match.

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

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;
const FRETES_KEY = "/api/fretes";
const ROW_HEIGHT = 41; // estimated px per row for the virtualizer

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchFretePage(offset: number): Promise<FretePage> {
  const res = await apiFetch(`${FRETES_KEY}?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) throw new Error("Erro ao carregar fretes");
  return res.json();
}

async function searchFretes(search: string): Promise<FretePage> {
  const res = await apiFetch(`${FRETES_KEY}?search=${encodeURIComponent(search)}&limit=5000`);
  if (!res.ok) throw new Error("Erro na busca");
  return res.json();
}

async function fetchAllFretes(search?: string): Promise<FreteRow[]> {
  const url = search
    ? `${FRETES_KEY}?search=${encodeURIComponent(search)}&limit=10000`
    : `${FRETES_KEY}?limit=10000`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Erro ao exportar");
  const data: FretePage = await res.json();
  return data.fretes;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Fretes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFrete, setEditingFrete] = useState<FreteRow | null>(null);

  // The scrollable div that react-virtual measures
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounce search input (300 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = debouncedSearch.length > 0;

  // ── Data fetching ──

  // Mode 1: paginated infinite scroll when no search term
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

  // Mode 2: server-side full-DB search when a term is entered
  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    queryKey: [FRETES_KEY, "search", debouncedSearch],
    queryFn: () => searchFretes(debouncedSearch),
    enabled: isSearching,
    staleTime: 30_000,
  });

  const fretes: FreteRow[] = useMemo(() => {
    if (isSearching) return searchData?.fretes ?? [];
    return infiniteData?.pages.flatMap((p) => p.fretes) ?? [];
  }, [isSearching, searchData, infiniteData]);

  const isLoading = isSearching ? isSearchLoading : isPagesLoading;

  // ── Virtualizer ──
  // Renders only the rows visible in the scroll container plus an overscan buffer.
  // Off-screen rows are unmounted; react-virtual uses spacer rows to maintain
  // the correct scroll position and height.

  const virtualizer = useVirtualizer({
    count: fretes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalVirtualSize = virtualizer.getTotalSize();
  const topPadding = virtualItems[0]?.start ?? 0;
  const bottomPadding = totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0);

  // Trigger next page load when the last rendered row is within 20 items of the end
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isSearching) return;
    if (lastVirtualIndex >= fretes.length - 20) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, fretes.length, hasNextPage, isFetchingNextPage, isSearching, fetchNextPage]);

  // ── CRUD ──

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

  // ── Export (always fetches complete dataset) ──

  const handleExportCsv = async () => {
    const rows = await fetchAllFretes(debouncedSearch || undefined);
    exportToCsv(rows, "fretes_export");
  };
  const handleExportExcel = async () => {
    const rows = await fetchAllFretes(debouncedSearch || undefined);
    exportToExcel(rows, "fretes_export");
  };

  // ── Highlight helper ──
  // Applied to every cell when search is active; no-ops when search is empty.

  const hl = useCallback(
    (text: string | null | undefined): React.ReactNode =>
      isSearching
        ? <Highlight text={text ?? ""} query={debouncedSearch} />
        : <>{text ?? ""}</>,
    [isSearching, debouncedSearch]
  );

  const isPastDue = (d: string | null) => {
    if (!d) return false;
    const dt = new Date(d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dt < today;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
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
        {/* Scrollable container — passed to useVirtualizer as the scroll element */}
        <div ref={scrollRef} className="overflow-auto flex-1">
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
 <TableHead className=" whitespace-nowrap">Peso (kg)</TableHead>
 <TableHead className=" whitespace-nowrap">Frete (R$)</TableHead>
 <TableHead className=" whitespace-nowrap">Pedágio (R$)</TableHead>
 <TableHead className=" font-bold text-[#0a192f] whitespace-nowrap">Total Frete (R$)</TableHead>
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
 <TableCell colSpan={16} className=" h-32 text-muted-foreground">
                    {isSearching ? "Nenhum frete encontrado para a busca." : "Nenhum frete encontrado."}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {/* Top spacer — fills the virtual height above the first rendered row */}
                  {topPadding > 0 && (
                    <TableRow aria-hidden>
                      <TableCell colSpan={16} style={{ height: topPadding, padding: 0 }} />
                    </TableRow>
                  )}

                  {/* Only the rows currently in the virtual window are rendered */}
                  {virtualItems.map((vItem) => {
                    const frete = fretes[vItem.index];
                    return (
                      <TableRow
                        key={frete.id}
                        style={{ height: ROW_HEIGHT }}
                        className="hover:bg-muted/50 transition-colors group"
                      >
                        <TableCell className="whitespace-nowrap">{hl(formatDate(frete.dataCte))}</TableCell>
                        <TableCell className="truncate max-w-[120px]" title={frete.origem}>{hl(frete.origem)}</TableCell>
                        <TableCell className="whitespace-nowrap">{hl(frete.transporte)}</TableCell>
                        <TableCell className="font-medium text-[#0a192f] whitespace-nowrap">{hl(frete.frota)}</TableCell>
                        <TableCell className="whitespace-nowrap">{hl(frete.transp)}</TableCell>
                        <TableCell className="truncate max-w-[140px]" title={frete.cliente}>{hl(frete.cliente)}</TableCell>
                        <TableCell className="truncate max-w-[110px]" title={frete.cidade}>{hl(frete.cidade)}</TableCell>
                        <TableCell className="whitespace-nowrap">{hl(frete.cteNf)}</TableCell>
 <TableCell className=" whitespace-nowrap">{hl(formatNumber(frete.peso))}</TableCell>
 <TableCell className=" whitespace-nowrap">{hl(formatCurrency(frete.frete))}</TableCell>
 <TableCell className=" whitespace-nowrap">{hl(formatCurrency(frete.pedagio))}</TableCell>
 <TableCell className=" font-bold text-[#2ecc71] bg-[#2ecc71]/10 whitespace-nowrap">
                          {hl(formatCurrency(frete.totalFrete))}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{hl(formatDate(frete.dtaFrete))}</TableCell>
                        <TableCell className={`whitespace-nowrap font-medium ${isPastDue(frete.vencimento) ? "text-red-600" : ""}`}>
                          {hl(formatDate(frete.vencimento))}
                        </TableCell>
                        <TableCell className="truncate max-w-[100px]" title={frete.obs || ""}>
                          {hl(frete.obs || "-")}
                        </TableCell>
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
                    );
                  })}

                  {/* Bottom spacer — fills virtual height below the last rendered row */}
                  {bottomPadding > 0 && (
                    <TableRow aria-hidden>
                      <TableCell colSpan={16} style={{ height: bottomPadding, padding: 0 }} />
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Fetching-next-page indicator shown below the scroll container */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-1.5 border-t py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Carregando mais registros…
          </div>
        )}
      </div>

      <FreteFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        frete={editingFrete}
      />
    </div>
  );
}
