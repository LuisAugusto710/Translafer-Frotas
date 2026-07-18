import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaskedDateInput } from "@/components/masked-date-input";
import {
  useCreateDespesa, useUpdateDespesa,
  useListFretes, getListFretesQueryKey,
  useListAbastecimentos, getListAbastecimentosQueryKey,
  useListFleetConfigs, useUpsertFleetConfig,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

// Numeric cost/metric fields shown in the form. `lucro` is computed server-side.
const NUMERIC_FIELDS: Array<{ name: string; label: string }> = [
  { name: "frete", label: "Frete (R$)" },
  { name: "km", label: "KM" },
  { name: "dieselLt", label: "Diesel (LT)" },
  { name: "dieselRs", label: "Diesel (R$)" },
  { name: "das", label: "DAS (R$)" },
  { name: "motorista", label: "Motorista (R$)" },
  { name: "almoco", label: "Almoço (R$)" },
  { name: "ajudante", label: "Ajudante (R$)" },
  { name: "pedagio", label: "Pedágio (R$)" },
  { name: "unimed", label: "Unimed (R$)" },
  { name: "seguro", label: "Seguro (R$)" },
  { name: "gasto", label: "Gasto (R$)" },
  { name: "rastreador", label: "Rastreador (R$)" },
  { name: "inss", label: "INSS (R$)" },
  { name: "escritorio", label: "Escritório (R$)" },
  { name: "ipva", label: "IPVA (R$)" },
  { name: "bsoft", label: "Bsoft (R$)" },
];

// Cost fields (KM and Diesel LT are metrics, excluded from totals).
const COST_FIELDS = [
  "dieselRs", "das", "motorista", "almoco", "ajudante", "pedagio",
  "unimed", "seguro", "gasto", "rastreador", "inss", "escritorio", "ipva", "bsoft",
];

type FormData = Record<string, string>;

function emptyForm(): FormData {
  const base: FormData = {
    data: "",
    frota: "",
    cidade: "",
    motoristaNome: "",
    ajudanteNome: "",
    trocaOleoParcela: "",
    obs: "",
  };
  for (const f of NUMERIC_FIELDS) base[f.name] = "";
  return base;
}

export function DespesaFormModal({
  open,
  onOpenChange,
  despesa,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  despesa?: any;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateDespesa();
  const updateMutation = useUpdateDespesa();
  const upsertFleetConfig = useUpsertFleetConfig();

  const [formData, setFormData] = useState<FormData>(emptyForm());
  const [kmPorLitro, setKmPorLitro] = useState<string>("");

  const isEditing = !!despesa?.id;
  const canAutoFetch = open && !isEditing && !!formData.data && !!formData.frota;

  // Always fetch fleet configs (light query, cached)
  const { data: fleetConfigs } = useListFleetConfigs();

  // Fetch the most recent diesel price for the selected fleet
  const { data: ultimoAbastFrota } = useQuery<{ precoLitro: number | null; kmFinal: number | null }>({
    queryKey: ["/api/abastecimentos/ultimo", formData.frota],
    queryFn: async ({ signal }) => {
      if (!formData.frota) return { precoLitro: null, kmFinal: null };
      const res = await fetch(`/api/abastecimentos/ultimo?placa=${encodeURIComponent(formData.frota)}`, { signal, credentials: "include" });
      return res.json();
    },
    enabled: open && !!formData.frota,
  });

  const { data: fretesDodia } = useListFretes(
    { frota: formData.frota, dateFrom: formData.data, dateTo: formData.data, limit: 1000 },
    { query: { enabled: canAutoFetch, queryKey: getListFretesQueryKey({ frota: formData.frota, dateFrom: formData.data, dateTo: formData.data, limit: 1000 }) } }
  );

  // Fetch diesel records for this fleet (placa = frota) and filter client-side by date
  const { data: abastecimentosDaFrota } = useListAbastecimentos(
    { placa: formData.frota, limit: 500 },
    { query: { enabled: canAutoFetch, queryKey: getListAbastecimentosQueryKey({ placa: formData.frota, limit: 500 }) } }
  );

  useEffect(() => {
    if (!canAutoFetch || !fretesDodia?.fretes) return;
    const totalFrete = fretesDodia.fretes.reduce((sum, f) => sum + (f.totalFrete ?? 0), 0);
    const totalPedagio = fretesDodia.fretes.reduce((sum, f) => sum + (f.pedagio ?? 0), 0);
    setFormData((prev) => ({
      ...prev,
      ...(totalFrete > 0 ? { frete: totalFrete.toFixed(2) } : {}),
      pedagio: totalPedagio.toFixed(2),
    }));
  }, [fretesDodia]);

  useEffect(() => {
    if (!canAutoFetch || !abastecimentosDaFrota?.abastecimentos) return;
    const matching = abastecimentosDaFrota.abastecimentos.filter(
      (a) => a.data?.split("T")[0] === formData.data
    );
    if (matching.length === 0) return;
    const totalKm = matching.reduce((s, a) => s + (a.kmPercorrido ?? 0), 0);
    const totalLt = matching.reduce((s, a) => s + (a.litros ?? 0), 0);
    const totalRs = matching.reduce((s, a) => s + (a.totalPago ?? 0), 0);
    setFormData((prev) => ({
      ...prev,
      ...(totalKm > 0 ? { km: totalKm.toFixed(2) } : {}),
      ...(totalLt > 0 ? { dieselLt: totalLt.toFixed(3) } : {}),
      ...(totalRs > 0 ? { dieselRs: totalRs.toFixed(2) } : {}),
    }));
  }, [abastecimentosDaFrota, formData.data]);

  // Populate kmPorLitro from fleet configs when frota changes
  useEffect(() => {
    if (!formData.frota || !fleetConfigs) return;
    const cfg = fleetConfigs.find((c) => c.frota === formData.frota);
    if (cfg?.kmPorLitro != null) {
      setKmPorLitro(String(cfg.kmPorLitro));
    }
  }, [formData.frota, fleetConfigs]);

  // Formula: when KM is entered and no real diesel records exist, calculate diesel fields
  useEffect(() => {
    if (!canAutoFetch) return;
    const km = parseFloat(formData.km);
    const kml = parseFloat(kmPorLitro);
    if (!km || km <= 0 || !kml || kml <= 0) return;

    // Only use formula when diesel records didn't already provide the data
    const matching = (abastecimentosDaFrota?.abastecimentos ?? []).filter(
      (a) => a.data?.split("T")[0] === formData.data
    );
    const hasDieselRecords = matching.some((a) => (a.kmPercorrido ?? 0) > 0);
    if (hasDieselRecords) return;

    const lt = km / kml;
    const updates: Record<string, string> = { dieselLt: lt.toFixed(3) };
    // Use the latest refueling price for this specific fleet (never the global average)
    const latestPreco = ultimoAbastFrota?.precoLitro;
    if (latestPreco != null && latestPreco > 0) {
      updates.dieselRs = (lt * latestPreco).toFixed(2);
    }
    setFormData((prev) => ({ ...prev, ...updates }));
  }, [formData.km, formData.data, kmPorLitro, ultimoAbastFrota, abastecimentosDaFrota, canAutoFetch]);

  useEffect(() => {
    if (!open) return;
    if (despesa) {
      const next: FormData = {
        data: despesa.data?.split("T")[0] || "",
        frota: despesa.frota || "",
        cidade: despesa.cidade || "",
        motoristaNome: despesa.motoristaNome || "",
        ajudanteNome: despesa.ajudanteNome || "",
        trocaOleoParcela: despesa.trocaOleoParcela || "",
        obs: despesa.obs || "",
      };
      for (const f of NUMERIC_FIELDS) {
        next[f.name] = despesa[f.name] != null ? String(despesa[f.name]) : "";
      }
      setFormData(next);
    } else {
      setFormData({ ...emptyForm(), data: new Date().toISOString().split("T")[0] });
      setKmPorLitro("");
    }
  }, [despesa, open]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const num = (v: string) => (v ? parseFloat(v) : 0) || 0;

  const totalDespesa = COST_FIELDS.reduce((s, k) => s + num(formData[k]), 0);
  const lucro = num(formData.frete) - totalDespesa;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.data) {
      toast({
        title: "Erro de Validação",
        description: "Preencha o campo obrigatório: Data.",
        variant: "destructive",
      });
      return;
    }

    // Persist KM/L config for this fleet (fire and forget)
    const kml = parseFloat(kmPorLitro);
    if (formData.frota && kml > 0) {
      upsertFleetConfig.mutate({ frota: formData.frota, data: { kmPorLitro: kml } });
    }

    const payload: Record<string, unknown> = {
      data: formData.data,
      frota: formData.frota,
      cidade: formData.cidade,
      motoristaNome: formData.motoristaNome,
      ajudanteNome: formData.ajudanteNome,
      trocaOleoParcela: formData.trocaOleoParcela,
      obs: formData.obs,
    };
    for (const f of NUMERIC_FIELDS) {
      payload[f.name] = formData[f.name] ? parseFloat(formData[f.name]) : 0;
    }

    const isEditing = !!despesa?.id;
    const mutation = isEditing ? updateMutation : createMutation;

    mutation.mutate(
      // @ts-expect-error generated mutation arg union
      isEditing ? { id: despesa.id, data: payload } : { data: payload },
      {
        onSuccess: () => {
          toast({
            title: "Sucesso",
            description: `Despesa ${isEditing ? "atualizada" : "criada"} com sucesso.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/despesas"] });
          queryClient.invalidateQueries({
            predicate: (query) =>
              typeof query.queryKey[0] === "string" &&
              query.queryKey[0].startsWith("/api/dashboard"),
          });
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const apiMsg =
            (err as any)?.response?.data?.error ??
            (err as any)?.response?.data?.message ??
            (err as any)?.message ??
            "Erro desconhecido ao salvar a despesa.";
          console.error("Erro ao salvar despesa:", err);
          toast({
            title: "Erro ao salvar despesa",
            description: apiMsg,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {despesa ? "Editar Despesa" : "Nova Entrada de Despesa"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Data */}
            <div className="space-y-2">
              <Label htmlFor="data">
                Data <span className="text-red-500">*</span>
              </Label>
              <MaskedDateInput
                id="data"
                name="data"
                value={formData.data}
                onChange={(iso) => setFormData((prev) => ({ ...prev, data: iso }))}
                required
              />
            </div>

            {/* Frota */}
            <div className="space-y-2">
              <Label htmlFor="frota">
                Frota <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="frota"
                name="frota"
                value={formData.frota}
                onChange={handleChange}
                placeholder="Ex: 4104"
              />
            </div>

            {/* Frete — immediately after Frota */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="frete">Frete (R$)</Label>
              <Input
                type="number"
                step="0.01"
                id="frete"
                name="frete"
                value={formData.frete}
                onChange={handleChange}
              />
            </div>

            {/* Cidade */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                name="cidade"
                value={formData.cidade}
                onChange={handleChange}
                placeholder="Patrocínio / não / SAB / DOM / feriado"
              />
            </div>

            {/* Driver group: name + payment together */}
            <div className="space-y-2">
              <Label htmlFor="motoristaNome">Motorista (Nome)</Label>
              <Input
                id="motoristaNome"
                name="motoristaNome"
                value={formData.motoristaNome}
                onChange={handleChange}
                placeholder="Nome do motorista"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motorista">Motorista (R$)</Label>
              <Input
                type="number"
                step="0.01"
                id="motorista"
                name="motorista"
                value={formData.motorista}
                onChange={handleChange}
              />
            </div>

            {/* Assistant group: name + payment together */}
            <div className="space-y-2">
              <Label htmlFor="ajudanteNome">Ajudante (Nome)</Label>
              <Input
                id="ajudanteNome"
                name="ajudanteNome"
                value={formData.ajudanteNome}
                onChange={handleChange}
                placeholder="Nome do ajudante"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ajudante">Ajudante (R$)</Label>
              <Input
                type="number"
                step="0.01"
                id="ajudante"
                name="ajudante"
                value={formData.ajudante}
                onChange={handleChange}
              />
            </div>

            {/* KM — rendered separately so KM/L config appears right after */}
            <div className="space-y-2">
              <Label htmlFor="km">KM</Label>
              <Input
                type="number"
                step="0.01"
                id="km"
                name="km"
                value={formData.km}
                onChange={handleChange}
              />
            </div>

            {/* KM/L — fuel efficiency config (persisted per fleet) */}
            <div className="space-y-2">
              <Label htmlFor="kmPorLitro">
                KM/L (eficiência)
              </Label>
              <Input
                type="number"
                step="0.01"
                id="kmPorLitro"
                value={kmPorLitro}
                onChange={(e) => setKmPorLitro(e.target.value)}
                placeholder={
                  !kmPorLitro && formData.frota
                    ? "Configure para calcular diesel"
                    : "Ex: 2.5"
                }
              />
              {/* Diesel price hint: shows latest refueling price for the selected fleet */}
              {formData.frota && ultimoAbastFrota != null && (
                ultimoAbastFrota.precoLitro != null ? (
                  <p className="text-xs text-muted-foreground">
                    Preço diesel (último abast.): <span className="font-medium text-foreground">R$ {ultimoAbastFrota.precoLitro.toFixed(2)}/L</span> — frota {formData.frota}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Nenhum abastecimento encontrado para a frota {formData.frota}. Preço diesel não calculado automaticamente.
                  </p>
                )
              )}
            </div>

            {/* Remaining numeric fields (km, frete, motorista, ajudante rendered above) */}
            {NUMERIC_FIELDS.filter(
              (f) => f.name !== "frete" && f.name !== "motorista" && f.name !== "ajudante" && f.name !== "km"
            ).map((f) => (
              <div className="space-y-2" key={f.name}>
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input
                  type="number"
                  step="0.01"
                  id={f.name}
                  name={f.name}
                  value={formData[f.name]}
                  onChange={handleChange}
                />
              </div>
            ))}

            {/* Oil Change Installment — tracking field near end */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="trocaOleoParcela">Parcela Troca de Óleo</Label>
              <Input
                id="trocaOleoParcela"
                name="trocaOleoParcela"
                value={formData.trocaOleoParcela}
                onChange={handleChange}
                placeholder="Ex: 1, 2/6, Parcela 3 de 6"
              />
            </div>
          </div>

          {/* Computed totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Total Despesa (Calculado)</Label>
              <Input
                value={formatCurrency(totalDespesa)}
                readOnly
                className="bg-muted font-bold text-red-500"
              />
            </div>
            <div className="space-y-2">
              <Label>Lucro (Calculado)</Label>
              <Input
                value={formatCurrency(lucro)}
                readOnly
                className={`bg-muted font-bold ${lucro >= 0 ? "text-emerald-600" : "text-red-500"}`}
              />
            </div>
          </div>

          {/* Obs */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              name="obs"
              value={formData.obs}
              onChange={handleChange}
              rows={2}
              placeholder="Observações"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending || updateMutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#0a192f] text-white min-w-[130px]"
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? "Salvando…"
                : "Salvar Despesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
