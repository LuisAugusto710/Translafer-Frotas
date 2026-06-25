import { useState } from "react";
import { 
  useListTrips, 
  getListTripsQueryKey,
  useDeleteTrip,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Upload, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter
} from "@/components/ui/table";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { TripFormModal } from "@/components/trip-form-modal";
import { exportToCsv, exportToExcel } from "@/lib/export";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export function DataEntry() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<any>(null);

  const { data, isLoading } = useListTrips({ search }, {
    query: { queryKey: getListTripsQueryKey({ search }) }
  });

  const deleteTrip = useDeleteTrip();

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this trip?")) {
      deleteTrip.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        }
      });
    }
  };

  const handleExportCsv = () => {
    if (data?.trips) exportToCsv(data.trips, "trips_export");
  };

  const handleExportExcel = () => {
    if (data?.trips) exportToExcel(data.trips, "trips_export");
  };

  const trips = data?.trips || [];
  const totalRev = trips.reduce((sum, t) => sum + t.revenueAmount, 0);
  const totalFuel = trips.reduce((sum, t) => sum + t.fuelCost, 0);
  const totalOther = trips.reduce((sum, t) => sum + t.otherExpenses, 0);
  const totalProfit = trips.reduce((sum, t) => sum + (t.revenueAmount - t.fuelCost - t.otherExpenses), 0);

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input 
            placeholder="Search trips..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>Export as Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => { setEditingTrip(null); setIsFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Trip
          </Button>
        </div>
      </div>

      <div className="border rounded-md flex-1 overflow-hidden flex flex-col bg-card shadow-sm">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Truck</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Fuel</TableHead>
                <TableHead className="text-right">Other Exp</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : trips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center h-32 text-muted-foreground">
                    No trips found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                trips.map((trip) => {
                  const netProfit = trip.revenueAmount - trip.fuelCost - trip.otherExpenses;
                  return (
                    <TableRow key={trip.id} className="cursor-pointer hover:bg-muted/50 transition-colors group">
                      <TableCell className="font-mono text-xs">{trip.date}</TableCell>
                      <TableCell className="font-medium">{trip.truckId}</TableCell>
                      <TableCell>{trip.driverName}</TableCell>
                      <TableCell>{trip.customerName}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={trip.route}>{trip.route}</TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(trip.revenueAmount)}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">{formatCurrency(trip.fuelCost)}</TableCell>
                      <TableCell className="text-right text-orange-600 dark:text-orange-400">{formatCurrency(trip.otherExpenses)}</TableCell>
                      <TableCell className={`text-right font-bold ${netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {formatCurrency(netProfit)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingTrip(trip); setIsFormOpen(true); }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(trip.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {trips.length > 0 && (
              <TableFooter className="bg-muted/80 backdrop-blur font-bold sticky bottom-0">
                <TableRow>
                  <TableCell colSpan={5}>Totals (Visible)</TableCell>
                  <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(totalRev)}</TableCell>
                  <TableCell className="text-right text-red-600 dark:text-red-400">{formatCurrency(totalFuel)}</TableCell>
                  <TableCell className="text-right text-orange-600 dark:text-orange-400">{formatCurrency(totalOther)}</TableCell>
                  <TableCell className={`text-right ${totalProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(totalProfit)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      <TripFormModal 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
        trip={editingTrip} 
      />
    </div>
  );
}
