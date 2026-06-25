import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  useListFretes, 
  getListFretesQueryKey,
  useDeleteFrete,
  useListFrotas
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Upload, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
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

export function Fretes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFrete, setEditingFrete] = useState<any>(null);

  const { data, isLoading } = useListFretes({ search }, {
    query: { queryKey: getListFretesQueryKey({ search }) }
  });

  const deleteFrete = useDeleteFrete();

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este frete?")) {
      deleteFrete.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFretesQueryKey() });
        }
      });
    }
  };

  const handleExportCsv = () => {
    if (data?.fretes) exportToCsv(data.fretes, "fretes_export");
  };

  const handleExportExcel = () => {
    if (data?.fretes) exportToExcel(data.fretes, "fretes_export");
  };

  const fretes = data?.fretes || [];
  const totalPeso = fretes.reduce((sum, f) => sum + (f.peso || 0), 0);
  const totalFrete = fretes.reduce((sum, f) => sum + (f.frete || 0), 0);
  const totalPedagio = fretes.reduce((sum, f) => sum + (f.pedagio || 0), 0);
  const totalGeral = fretes.reduce((sum, f) => sum + (f.totalFrete || 0), 0);

  const isPastDue = (dateStr: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    return date < today;
  };

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar fretes..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => { setEditingFrete(null); setIsFormOpen(true); }} className="bg-[#0a192f] hover:bg-[#0a192f]/90 text-white">
            <Plus className="mr-2 h-4 w-4" />
            Nova Entrada
          </Button>
        </div>
      </div>

      <div className="border rounded-md flex-1 overflow-hidden flex flex-col bg-card shadow-sm text-sm">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur">
              <TableRow>
                <TableHead>Data CTE</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Transporte</TableHead>
                <TableHead>Frota</TableHead>
                <TableHead>Transp</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>CTE/NF</TableHead>
                <TableHead className="text-right">Peso (kg)</TableHead>
                <TableHead className="text-right">Frete (R$)</TableHead>
                <TableHead className="text-right">Pedágio (R$)</TableHead>
                <TableHead className="text-right font-bold text-[#0a192f]">Total Frete (R$)</TableHead>
                <TableHead>Dta Frete</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Obs</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 16 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full min-w-[60px]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : fretes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} className="text-center h-32 text-muted-foreground">
                    Nenhum frete encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                fretes.map((frete) => (
                  <TableRow key={frete.id} className="hover:bg-muted/50 transition-colors group">
                    <TableCell className="whitespace-nowrap">{formatDate(frete.dataCte)}</TableCell>
                    <TableCell className="truncate max-w-[120px]" title={frete.origem}>{frete.origem}</TableCell>
                    <TableCell>{frete.transporte}</TableCell>
                    <TableCell className="font-medium text-[#0a192f]">{frete.frota}</TableCell>
                    <TableCell>{frete.transp}</TableCell>
                    <TableCell className="truncate max-w-[150px]" title={frete.cliente}>{frete.cliente}</TableCell>
                    <TableCell className="truncate max-w-[120px]" title={frete.cidade}>{frete.cidade}</TableCell>
                    <TableCell>{frete.cteNf}</TableCell>
                    <TableCell className="text-right">{formatNumber(frete.peso)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(frete.frete)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(frete.pedagio)}</TableCell>
                    <TableCell className="text-right font-bold text-[#2ecc71] bg-[#2ecc71]/10">{formatCurrency(frete.totalFrete)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(frete.dtaFrete)}</TableCell>
                    <TableCell className={`whitespace-nowrap font-medium ${isPastDue(frete.vencimento) ? 'text-red-600' : ''}`}>
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
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(frete.id)}>
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
                  <TableCell colSpan={8} className="text-right">TOTAIS:</TableCell>
                  <TableCell className="text-right">{formatNumber(totalPeso)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalFrete)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalPedagio)}</TableCell>
                  <TableCell className="text-right text-[#2ecc71]">{formatCurrency(totalGeral)}</TableCell>
                  <TableCell colSpan={4}></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
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
