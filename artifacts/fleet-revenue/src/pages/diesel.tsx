import { useState } from "react";
import { 
  useListAbastecimentos, 
  getListAbastecimentosQueryKey,
  useDeleteAbastecimento
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
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
import { AbastecimentoFormModal } from "@/components/abastecimento-form-modal";

export function Diesel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAbast, setEditingAbast] = useState<any>(null);

  const { data, isLoading } = useListAbastecimentos({ search }, {
    query: { queryKey: getListAbastecimentosQueryKey({ search }) }
  });

  const deleteAbast = useDeleteAbastecimento();

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este abastecimento?")) {
      deleteAbast.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAbastecimentosQueryKey() });
          queryClient.invalidateQueries({
            predicate: (query) =>
              typeof query.queryKey[0] === "string" &&
              query.queryKey[0].startsWith("/api/dashboard"),
          });
        }
      });
    }
  };

  const handleExportCsv = () => {
    if (data?.abastecimentos) exportToCsv(data.abastecimentos, "diesel_export");
  };

  const handleExportExcel = () => {
    if (data?.abastecimentos) exportToExcel(data.abastecimentos, "diesel_export");
  };

  const abasts = data?.abastecimentos || [];
  const totalLitros = abasts.reduce((sum, a) => sum + (a.litros || 0), 0);
  const totalPago = abasts.reduce((sum, a) => sum + (a.totalPago || 0), 0);
  const avgMedia =
    totalLitros > 0
      ? abasts.reduce((sum, a) => sum + (a.kmPercorrido || 0), 0) / totalLitros
      : 0;

  const getMediaColor = (media: number | null | undefined) => {
    if (!media) return "";
    if (media > 4.5) return "text-green-600 bg-green-50";
    if (media >= 3.5) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  return (
    <div className="space-y-3 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar (frota, posto)..."
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
            onClick={() => { setEditingAbast(null); setIsFormOpen(true); }}
            className="bg-[#0a192f] hover:bg-[#0a192f]/90 text-white"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Abastecimento</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md flex-1 overflow-hidden flex flex-col bg-card shadow-sm text-sm min-h-0">
        <div className="overflow-auto flex-1">
          <Table className="min-w-[960px]">
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur">
              <TableRow>
                <TableHead className="w-[40px] whitespace-nowrap">#</TableHead>
                <TableHead className="whitespace-nowrap">REQ</TableHead>
                <TableHead className="whitespace-nowrap">Posto</TableHead>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="whitespace-nowrap">Frota</TableHead>
                <TableHead className="text-right whitespace-nowrap">Litros</TableHead>
                <TableHead className="text-right whitespace-nowrap">R$/L</TableHead>
                <TableHead className="text-right font-bold text-[#0a192f] whitespace-nowrap">Total (R$)</TableHead>
                <TableHead className="text-right whitespace-nowrap">KM Início</TableHead>
                <TableHead className="text-right whitespace-nowrap">KM Final</TableHead>
                <TableHead className="text-right whitespace-nowrap">KM Perc.</TableHead>
                <TableHead className="text-center whitespace-nowrap">Média (km/l)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 13 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : abasts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center h-32 text-muted-foreground">
                    Nenhum abastecimento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                abasts.map((a, index) => (
                  <TableRow key={a.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>{a.requisicao || "-"}</TableCell>
                    <TableCell className="truncate max-w-[110px]">{a.posto || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(a.data)}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{a.placa}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatNumber(a.litros, 2)} L</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(a.precoLitro)}</TableCell>
                    <TableCell className="text-right font-bold whitespace-nowrap">{formatCurrency(a.totalPago)}</TableCell>
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">{formatNumber(a.kmInicio, 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">{formatNumber(a.kmFinal, 0)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatNumber(a.kmPercorrido, 0)}</TableCell>
                    <TableCell className="text-center">
                      <div className={`px-2 py-1 rounded inline-block font-bold min-w-[52px] ${getMediaColor(a.media)}`}>
                        {formatNumber(a.media, 2)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingAbast(a); setIsFormOpen(true); }}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(a.id)}
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
            {abasts.length > 0 && (
              <TableFooter className="bg-[#0a192f] text-white font-bold sticky bottom-0">
                <TableRow>
                  <TableCell colSpan={5} className="text-right whitespace-nowrap">TOTAIS:</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatNumber(totalLitros, 2)} L</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right text-[#2ecc71] whitespace-nowrap">{formatCurrency(totalPago)}</TableCell>
                  <TableCell colSpan={3}></TableCell>
                  <TableCell className="text-center bg-[#1a2f4c] whitespace-nowrap">{formatNumber(avgMedia, 2)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      <AbastecimentoFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        abastecimento={editingAbast}
      />
    </div>
  );
}
