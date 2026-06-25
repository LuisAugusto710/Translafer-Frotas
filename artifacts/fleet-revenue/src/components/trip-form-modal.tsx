import { useState } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateTrip, useUpdateTrip, getListTripsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const tripSchema = z.object({
  date: z.string().min(1, "Date is required"),
  truckId: z.string().min(1, "Truck ID is required"),
  driverName: z.string().min(1, "Driver Name is required"),
  customerName: z.string().min(1, "Customer Name is required"),
  route: z.string().min(1, "Route is required"),
  freightDescription: z.string().optional(),
  revenueAmount: z.coerce.number().min(0, "Must be positive"),
  fuelCost: z.coerce.number().min(0, "Must be positive"),
  otherExpenses: z.coerce.number().min(0, "Must be positive"),
  notes: z.string().optional(),
});

type TripFormValues = z.infer<typeof tripSchema>;

export function TripFormModal({ 
  open, 
  onOpenChange, 
  trip 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  trip?: any;
}) {
  const queryClient = useQueryClient();
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: trip ? {
      date: trip.date,
      truckId: trip.truckId,
      driverName: trip.driverName,
      customerName: trip.customerName,
      route: trip.route,
      freightDescription: trip.freightDescription || "",
      revenueAmount: trip.revenueAmount,
      fuelCost: trip.fuelCost,
      otherExpenses: trip.otherExpenses,
      notes: trip.notes || "",
    } : {
      date: format(new Date(), 'yyyy-MM-dd'),
      truckId: "",
      driverName: "",
      customerName: "",
      route: "",
      freightDescription: "",
      revenueAmount: 0,
      fuelCost: 0,
      otherExpenses: 0,
      notes: "",
    }
  });

  const onSubmit = (values: TripFormValues) => {
    if (trip?.id) {
      updateTrip.mutate({ id: trip.id, data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          onOpenChange(false);
        }
      });
    } else {
      createTrip.mutate({ data: values }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          onOpenChange(false);
          form.reset();
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trip ? "Edit Trip" : "Log New Trip"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="truckId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Truck ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. TRK-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="driverName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="route"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Route</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Dallas, TX - Chicago, IL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="freightDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Freight</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="revenueAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Revenue ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fuelCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Cost ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="otherExpenses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other Expenses ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createTrip.isPending || updateTrip.isPending}>
                {trip ? "Save Changes" : "Create Trip"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
