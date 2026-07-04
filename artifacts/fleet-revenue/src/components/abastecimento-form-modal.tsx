import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaskedDateInput } from "@/components/masked-date-input";
import { useCreateAbastecimento, useUpdateAbastecimento, getListAbastecimentosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function AbastecimentoFormModal({
  open,
  onOpenChange,
  abastecimento,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  abastecimento?: any;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateAbastecimento();
  const updateMutation = useUpdateAbastecimento();

  const [formData, setFormData] = useState({
    requisicao: "",
    posto: "",
    data: new Date().toISOString().split("T")[0],
    placa: "",
    litros: "",
    precoLitro: "",
    totalPago: "",
    kmInicio: "",
    kmFinal: "",
    kmPercorrido: "",
  });

  useEffect(() => {
    if (open) {
      if (abastecimento) {
        setFormData({
          requisicao: abastecimento.requisicao || "",
          posto: abastecimento.posto || "",
          data: abastecimento.data?.split("T")[0] || "",
          placa: abastecimento.placa || "",
          litros: abastecimento.litros?.toString() || "",
          precoLitro: abastecimento.precoLitro?.toString() || "",
          totalPago: abastecimento.totalPago?.toString() || "",
          kmInicio: abastecimento.kmInicio?.toString() || "",
          kmFinal: abastecimento.kmFinal?.toString() || "",
          kmPercorrido: abastecimento.kmPercorrido?.toString() || "",
        });
      } else {
        setFormData({
          requisicao: "",
          posto: "",
          data: new Date().toISOString().split("T")[0],
          placa: "",
          litros: "",
          precoLitro: "",
          totalPago: "",
          kmInicio: "",
          kmFinal: "",
          kmPercorrido: "",
        });
      }
    }
  }, [abastecimento, open]);

  // Auto-calculate Total when litros or precoLitro changes
  useEffect(() => {
    const l = parseFloat(formData.litros) || 0;
    const p = parseFloat(formData.precoLitro) || 0;
    if (l > 0 && p > 0) {
      setFormData((prev) => ({ ...prev, totalPago: (l * p).toFixed(2) }));
    }
  }, [formData.litros, formData.precoLitro]);

  // Auto-calculate KM Percorrido
  useEffect(() => {
    const ki = parseFloat(formData.kmInicio) || 0;
    const kf = parseFloat(formData.kmFinal) || 0;
    if (kf > 0 && ki > 0 && kf >= ki) {
      setFormData((prev) => ({ ...prev, kmPercorrido: (kf - ki).toString() }));
    }
  }, [formData.kmInicio, formData.kmFinal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const litrosNum = parseFloat(formData.litros);
    const kmpNum = formData.kmPercorrido ? parseFloat(formData.kmPercorrido) : undefined;
    const mediaNum = kmpNum && kmpNum > 0 && litrosNum > 0 ? kmpNum / litrosNum : undefined;

    const payload = {
      ...formData,
      litros: litrosNum,
      precoLitro: parseFloat(formData.precoLitro),
      totalPago: parseFloat(formData.totalPago),
      kmInicio: formData.kmInicio ? parseFloat(formData.kmInicio) : undefined,
      kmFinal: formData.kmFinal ? parseFloat(formData.kmFinal) : undefined,
      kmPercorrido: kmpNum,
      media: mediaNum,
    };

    if (!payload.data || !payload.placa || !payload.litros || !payload.precoLitro) {
      toast({
        title: "Erro de Validação",
        description: "Preencha frota, data, litros e R$/L.",
        variant: "destructive",
      });
      return;
    }

    const isEditing = !!abastecimento?.id;
    const mutation = isEditing ? updateMutation : createMutation;

    // @ts-ignore
    mutation.mutate(
      isEditing
        ? { id: abastecimento.id, data: payload }
        : { data: payload },
      {
        onSuccess: () => {
          toast({
            title: "Sucesso",
            description: `Abastecimento ${isEditing ? "atualizado" : "registrado"} com sucesso.`,
          });
          queryClient.invalidateQueries({
            queryKey: getListAbastecimentosQueryKey(),
          });
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
            description: "Ocorreu um erro ao salvar.",
            variant: "destructive",
          });
          console.error(err);
        },
      }
    );
  };

  const l = parseFloat(formData.litros) || 0;
  const kmp = parseFloat(formData.kmPercorrido) || 0;
  const mediaCalc = l > 0 && kmp > 0 ? (kmp / l).toFixed(3) : "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {abastecimento ? "Editar Abastecimento" : "Novo Abastecimento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Data */}
            <div className="space-y-2">
              <Label>
                Data <span className="text-red-500">*</span>
              </Label>
              <MaskedDateInput
                name="data"
                value={formData.data}
                onChange={(iso) =>
                  setFormData((prev) => ({ ...prev, data: iso }))
                }
                required
              />
            </div>

            {/* Frota */}
            <div className="space-y-2">
              <Label>
                Frota <span className="text-red-500">*</span>
              </Label>
              <Input
                name="placa"
                value={formData.placa}
                onChange={handleChange}
                placeholder="Ex: DZY1A49"
                required
                className="uppercase"
              />
            </div>

            {/* Requisição */}
            <div className="space-y-2">
              <Label>Requisição (REQ)</Label>
              <Input
                name="requisicao"
                value={formData.requisicao}
                onChange={handleChange}
              />
            </div>

            {/* Posto */}
            <div className="space-y-2">
              <Label>Posto</Label>
              <Input
                name="posto"
                value={formData.posto}
                onChange={handleChange}
              />
            </div>

            {/* Litros */}
            <div className="space-y-2">
              <Label>
                Litros <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                name="litros"
                value={formData.litros}
                onChange={handleChange}
                required
              />
            </div>

            {/* R$/Litro */}
            <div className="space-y-2">
              <Label>
                R$/Litro <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                step="0.001"
                name="precoLitro"
                value={formData.precoLitro}
                onChange={handleChange}
                required
              />
            </div>

            {/* Total */}
            <div className="space-y-2 md:col-span-2">
              <Label>Total a Pagar (R$)</Label>
              <Input
                type="number"
                step="0.01"
                name="totalPago"
                value={formData.totalPago}
                onChange={handleChange}
                required
                className="font-bold text-[#0a192f] border-[#0a192f]"
              />
            </div>

            {/* KM Início */}
            <div className="space-y-2">
              <Label>KM Início</Label>
              <Input
                type="number"
                name="kmInicio"
                value={formData.kmInicio}
                onChange={handleChange}
              />
            </div>

            {/* KM Final */}
            <div className="space-y-2">
              <Label>KM Final</Label>
              <Input
                type="number"
                name="kmFinal"
                value={formData.kmFinal}
                onChange={handleChange}
              />
            </div>

            {/* KM Percorrido */}
            <div className="space-y-2">
              <Label>KM Percorrido</Label>
              <Input
                type="number"
                name="kmPercorrido"
                value={formData.kmPercorrido}
                onChange={handleChange}
              />
            </div>

            {/* Média */}
            <div className="space-y-2">
              <Label>Média Calculada (km/l)</Label>
              <Input
                value={mediaCalc}
                readOnly
                className="bg-muted font-bold text-center"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#0a192f] text-white"
            >
              Salvar Abastecimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
