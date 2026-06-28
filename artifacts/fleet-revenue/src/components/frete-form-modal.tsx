import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaskedDateInput } from "@/components/masked-date-input";
import { useCreateFrete, useUpdateFrete, getListFretesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type PesoTipo = "peso" | "tempo";

function extractTempoFromObs(obs: string): { horas: string; minutos: string } | null {
  const match = obs?.match(/^\[TEMPO:\s*(\d+)h\s*(\d+)min\]/);
  if (match) return { horas: match[1], minutos: match[2] };
  return null;
}

function buildObsWithTempo(horas: string, minutos: string, restObs: string): string {
  const h = parseInt(horas) || 0;
  const m = parseInt(minutos) || 0;
  const tag = `[TEMPO: ${h}h ${m}min]`;
  return restObs ? `${tag} ${restObs}` : tag;
}

function stripTempoFromObs(obs: string): string {
  return obs?.replace(/^\[TEMPO:\s*\d+h\s*\d+min\]\s*/, "") || "";
}

export function FreteFormModal({
  open,
  onOpenChange,
  frete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frete?: any;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateFrete();
  const updateMutation = useUpdateFrete();

  const [pesoTipo, setPesoTipo] = useState<PesoTipo>("peso");
  const [horas, setHoras] = useState("0");
  const [minutos, setMinutos] = useState("0");

  const [formData, setFormData] = useState({
    dataCte: "",
    origem: "",
    transporte: "",
    frota: "",
    transp: "",
    cliente: "",
    cidade: "",
    cteNf: "",
    peso: "",
    frete: "",
    pedagio: "0",
    dtaFrete: "",
    vencimento: "",
    obs: "",
  });

  useEffect(() => {
    if (open) {
      if (frete) {
        const tempoInfo = extractTempoFromObs(frete.obs || "");
        const tipo: PesoTipo = tempoInfo ? "tempo" : "peso";
        setPesoTipo(tipo);
        setHoras(tempoInfo?.horas || "0");
        setMinutos(tempoInfo?.minutos || "0");
        setFormData({
          dataCte: frete.dataCte?.split("T")[0] || "",
          origem: frete.origem || "",
          transporte: frete.transporte || "",
          frota: frete.frota || "",
          transp: frete.transp || "",
          cliente: frete.cliente || "",
          cidade: frete.cidade || "",
          cteNf: frete.cteNf || "",
          peso: tipo === "tempo" ? "" : (frete.peso?.toString() || ""),
          frete: frete.frete?.toString() || "",
          pedagio: frete.pedagio?.toString() || "0",
          dtaFrete: frete.dtaFrete?.split("T")[0] || "",
          vencimento: frete.vencimento?.split("T")[0] || "",
          obs: stripTempoFromObs(frete.obs || ""),
        });
      } else {
        setPesoTipo("peso");
        setHoras("0");
        setMinutos("0");
        setFormData({
          dataCte: new Date().toISOString().split("T")[0],
          origem: "",
          transporte: "",
          frota: "",
          transp: "",
          cliente: "",
          cidade: "",
          cteNf: "",
          peso: "",
          frete: "",
          pedagio: "0",
          dtaFrete: "",
          vencimento: "",
          obs: "",
        });
      }
    }
  }, [frete, open]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let pesoValue: number | undefined;
    let obsValue = formData.obs;

    if (pesoTipo === "tempo") {
      const h = parseInt(horas) || 0;
      const m = parseInt(minutos) || 0;
      if (h === 0 && m === 0) {
        toast({
          title: "Erro de Validação",
          description: "Informe o tempo (horas e/ou minutos).",
          variant: "destructive",
        });
        return;
      }
      pesoValue = undefined;
      obsValue = buildObsWithTempo(horas, minutos, formData.obs);
    } else {
      pesoValue = formData.peso ? parseFloat(formData.peso) : undefined;
    }

    const payload = {
      ...formData,
      obs: obsValue,
      peso: pesoValue,
      frete: formData.frete ? parseFloat(formData.frete) : 0,
      pedagio: formData.pedagio ? parseFloat(formData.pedagio) : 0,
    };

    if (
      !payload.dataCte ||
      !payload.origem ||
      !payload.frota ||
      !payload.cliente ||
      !payload.cidade
    ) {
      toast({
        title: "Erro de Validação",
        description: "Preencha os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    const isEditing = !!frete?.id;
    const mutation = isEditing ? updateMutation : createMutation;

    // @ts-ignore
    mutation.mutate(
      isEditing ? { id: frete.id, data: payload } : { data: payload },
      {
        onSuccess: () => {
          toast({
            title: "Sucesso",
            description: `Frete ${isEditing ? "atualizado" : "criado"} com sucesso.`,
          });
          // Invalidate all fretes queries (paginated + search) and dashboard
          queryClient.invalidateQueries({ queryKey: ["/api/fretes"] });
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
            description: "Ocorreu um erro ao salvar o frete.",
            variant: "destructive",
          });
          console.error(err);
        },
      }
    );
  };

  const totalFrete =
    (parseFloat(formData.frete || "0") + parseFloat(formData.pedagio || "0")).toFixed(2);

  const isPastDue =
    formData.vencimento &&
    new Date(formData.vencimento) < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {frete ? "Editar Frete" : "Nova Entrada de Frete"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Data CTE */}
            <div className="space-y-2">
              <Label htmlFor="dataCte">
                Data CTE <span className="text-red-500">*</span>
              </Label>
              <MaskedDateInput
                id="dataCte"
                name="dataCte"
                value={formData.dataCte}
                onChange={(iso) =>
                  setFormData((prev) => ({ ...prev, dataCte: iso }))
                }
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
                placeholder="Ex: 1118"
                required
              />
            </div>

            {/* Origem */}
            <div className="space-y-2">
              <Label htmlFor="origem">
                Origem <span className="text-red-500">*</span>
              </Label>
              <Input
                id="origem"
                name="origem"
                value={formData.origem}
                onChange={handleChange}
                placeholder="Ex: Distribuição Cesário"
                required
              />
            </div>

            {/* Transporte */}
            <div className="space-y-2">
              <Label htmlFor="transporte">Transporte</Label>
              <Input
                id="transporte"
                name="transporte"
                value={formData.transporte}
                onChange={handleChange}
                placeholder="Nº Transporte"
              />
            </div>

            {/* Cliente */}
            <div className="space-y-2">
              <Label htmlFor="cliente">
                Cliente <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cliente"
                name="cliente"
                value={formData.cliente}
                onChange={handleChange}
                required
              />
            </div>

            {/* Cidade */}
            <div className="space-y-2">
              <Label htmlFor="cidade">
                Cidade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cidade"
                name="cidade"
                value={formData.cidade}
                onChange={handleChange}
                required
              />
            </div>

            {/* Transp */}
            <div className="space-y-2">
              <Label htmlFor="transp">Transp (Transportadora)</Label>
              <Input
                id="transp"
                name="transp"
                value={formData.transp}
                onChange={handleChange}
                placeholder="Ex: LAFER"
              />
            </div>

            {/* CTE/NF */}
            <div className="space-y-2">
              <Label htmlFor="cteNf">CTE/NF</Label>
              <Input
                id="cteNf"
                name="cteNf"
                value={formData.cteNf}
                onChange={handleChange}
              />
            </div>

            {/* Peso / Tempo — full row */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-3">
                <Label>Quantidade</Label>
                <div className="flex rounded-md border border-input overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => setPesoTipo("peso")}
                    className={`px-3 py-1 transition-colors ${
                      pesoTipo === "peso"
                        ? "bg-[#0a192f] text-white"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    ⚖ Por Peso (kg)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPesoTipo("tempo")}
                    className={`px-3 py-1 border-l border-input transition-colors ${
                      pesoTipo === "tempo"
                        ? "bg-[#0a192f] text-white"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    ⏱ Por Tempo (H/min)
                  </button>
                </div>
              </div>

              {pesoTipo === "peso" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="peso">Peso (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      id="peso"
                      name="peso"
                      value={formData.peso}
                      onChange={handleChange}
                      placeholder="Ex: 5.200"
                    />
                  </div>
                  <div />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="horas">Horas</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        id="horas"
                        min="0"
                        max="999"
                        value={horas}
                        onChange={(e) => setHoras(e.target.value)}
                        className="pr-8"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">
                        h
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minutos">Minutos</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        id="minutos"
                        min="0"
                        max="59"
                        value={minutos}
                        onChange={(e) => setMinutos(e.target.value)}
                        className="pr-10"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">
                        min
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      Duração:{" "}
                      <span className="font-semibold text-foreground">
                        {parseInt(horas) || 0}h {parseInt(minutos) || 0}min
                      </span>
                      {" "}— será registrado em Observações
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Frete */}
            <div className="space-y-2">
              <Label htmlFor="frete">
                Frete (R$) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                id="frete"
                name="frete"
                value={formData.frete}
                onChange={handleChange}
                required
              />
            </div>

            {/* Pedágio */}
            <div className="space-y-2">
              <Label htmlFor="pedagio">Pedágio (R$)</Label>
              <Input
                type="number"
                step="0.01"
                id="pedagio"
                name="pedagio"
                value={formData.pedagio}
                onChange={handleChange}
              />
            </div>

            {/* Total calculado */}
            <div className="space-y-2 md:col-span-2">
              <Label>Total Frete (Calculado)</Label>
              <Input
                value={`R$ ${totalFrete}`}
                readOnly
                className="bg-muted font-bold text-[#2ecc71]"
              />
            </div>

            {/* Data do Frete */}
            <div className="space-y-2">
              <Label htmlFor="dtaFrete">Data do Frete</Label>
              <MaskedDateInput
                id="dtaFrete"
                name="dtaFrete"
                value={formData.dtaFrete}
                onChange={(iso) =>
                  setFormData((prev) => ({ ...prev, dtaFrete: iso }))
                }
              />
            </div>

            {/* Vencimento */}
            <div className="space-y-2">
              <Label
                htmlFor="vencimento"
                className={isPastDue ? "text-red-500 font-bold" : ""}
              >
                Vencimento
                {isPastDue && (
                  <span className="ml-2 text-xs font-normal">⚠ Vencido</span>
                )}
              </Label>
              <MaskedDateInput
                id="vencimento"
                name="vencimento"
                value={formData.vencimento}
                onChange={(iso) =>
                  setFormData((prev) => ({ ...prev, vencimento: iso }))
                }
                className={isPastDue ? "border-red-500" : ""}
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
              placeholder={
                pesoTipo === "tempo"
                  ? "Observações adicionais (o tempo será adicionado automaticamente)"
                  : "Observações"
              }
            />
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
              Salvar Frete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
