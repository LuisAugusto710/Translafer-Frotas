import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaskedDateInput } from "@/components/masked-date-input";
import { useCreateDespesa, useUpdateDespesa } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
    obs: "",
  };
  for (const f of NUMERIC_FIELDS) base[f.name] = "0";
  base.frete = "";
  base.km = "";
  base.dieselLt = "";
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

  const [formData, setFormData] = useState<FormData>(emptyForm());

  useEffect(() => {
    if (!open) return;
    if (despesa) {
      const next: FormData = {
        data: despesa.data?.split("T")[0] || "",
        frota: despesa.frota || "",
        cidade: despesa.cidade || "",
        motoristaNome: despesa.motoristaNome || "",
        ajudanteNome: despesa.ajudanteNome || "",
        obs: despesa.obs || "",
      };
      for (const f of NUMERIC_FIELDS) {
        next[f.name] = despesa[f.name] != null ? String(despesa[f.name]) : "0";
      }
      setFormData(next);
    } else {
      setFormData({ ...emptyForm(), data: new Date().toISOString().split("T")[0] });
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

    if (!formData.data || !formData.frota) {
      toast({
        title: "Erro de Validação",
        description: "Preencha os campos obrigatórios (Data e Frota).",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      data: formData.data,
      frota: formData.frota,
      cidade: formData.cidade,
      motoristaNome: formData.motoristaNome,
      ajudanteNome: formData.ajudanteNome,
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
        onError: (err) => {
          toast({
            title: "Erro",
            description: "Ocorreu um erro ao salvar a despesa.",
            variant: "destructive",
          });
          console.error(err);
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
                Frota <span className="text-red-500">*</span>
              </Label>
              <Input
                id="frota"
                name="frota"
                value={formData.frota}
                onChange={handleChange}
                placeholder="Ex: 4104"
                required
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
                placeholder="Ex: Patrocínio / não / SAB / DOM / feriado"
              />
            </div>

            {/* Motorista (Nome) */}
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

            {/* Ajudante (Nome) */}
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

            {/* Numeric fields */}
            {NUMERIC_FIELDS.map((f) => (
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
                className={`bg-muted font-bold ${lucro >= 0 ? "text-[#2ecc71]" : "text-red-500"}`}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#0a192f] text-white"
            >
              Salvar Despesa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
