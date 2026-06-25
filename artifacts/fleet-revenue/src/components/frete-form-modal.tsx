import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateFrete, useUpdateFrete, getListFretesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function FreteFormModal({ open, onOpenChange, frete }: { open: boolean; onOpenChange: (open: boolean) => void; frete?: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateFrete();
  const updateMutation = useUpdateFrete();
  
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
    obs: ""
  });

  useEffect(() => {
    if (frete && open) {
      setFormData({
        dataCte: frete.dataCte?.split('T')[0] || "",
        origem: frete.origem || "",
        transporte: frete.transporte || "",
        frota: frete.frota || "",
        transp: frete.transp || "",
        cliente: frete.cliente || "",
        cidade: frete.cidade || "",
        cteNf: frete.cteNf || "",
        peso: frete.peso?.toString() || "",
        frete: frete.frete?.toString() || "",
        pedagio: frete.pedagio?.toString() || "0",
        dtaFrete: frete.dtaFrete?.split('T')[0] || "",
        vencimento: frete.vencimento?.split('T')[0] || "",
        obs: frete.obs || ""
      });
    } else if (open) {
      setFormData({
        dataCte: new Date().toISOString().split('T')[0],
        origem: "", transporte: "", frota: "", transp: "",
        cliente: "", cidade: "", cteNf: "", peso: "",
        frete: "", pedagio: "0", dtaFrete: "", vencimento: "", obs: ""
      });
    }
  }, [frete, open]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      peso: formData.peso ? parseFloat(formData.peso) : undefined,
      frete: formData.frete ? parseFloat(formData.frete) : 0,
      pedagio: formData.pedagio ? parseFloat(formData.pedagio) : 0,
    };

    if (!payload.dataCte || !payload.origem || !payload.frota || !payload.cliente || !payload.cidade) {
      toast({ title: "Erro de Validação", description: "Preencha os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const isEditing = !!frete?.id;
    const mutation = isEditing ? updateMutation : createMutation;
    
    // @ts-ignore
    mutation.mutate(isEditing ? { id: frete.id, data: payload } : { data: payload }, {
      onSuccess: () => {
        toast({ title: "Sucesso", description: `Frete ${isEditing ? 'atualizado' : 'criado'} com sucesso.` });
        queryClient.invalidateQueries({ queryKey: getListFretesQueryKey() });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Erro", description: "Ocorreu um erro ao salvar o frete.", variant: "destructive" });
        console.error(err);
      }
    });
  };

  const isPastDue = formData.vencimento && new Date(formData.vencimento) < new Date(new Date().setHours(0,0,0,0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{frete ? "Editar Frete" : "Nova Entrada de Frete"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataCte">Data CTE <span className="text-red-500">*</span></Label>
              <Input type="date" id="dataCte" name="dataCte" value={formData.dataCte} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frota">Frota <span className="text-red-500">*</span></Label>
              <Input id="frota" name="frota" value={formData.frota} onChange={handleChange} placeholder="Ex: 1118" required />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="origem">Origem <span className="text-red-500">*</span></Label>
              <Input id="origem" name="origem" value={formData.origem} onChange={handleChange} placeholder="Ex: Distribuição Cesário" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transporte">Transporte</Label>
              <Input id="transporte" name="transporte" value={formData.transporte} onChange={handleChange} placeholder="Nº Transporte" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente <span className="text-red-500">*</span></Label>
              <Input id="cliente" name="cliente" value={formData.cliente} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cidade">Cidade <span className="text-red-500">*</span></Label>
              <Input id="cidade" name="cidade" value={formData.cidade} onChange={handleChange} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transp">Transp (Transportadora)</Label>
              <Input id="transp" name="transp" value={formData.transp} onChange={handleChange} placeholder="Ex: LAFER" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cteNf">CTE/NF</Label>
              <Input id="cteNf" name="cteNf" value={formData.cteNf} onChange={handleChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="peso">Peso (kg)</Label>
              <Input type="number" step="0.01" id="peso" name="peso" value={formData.peso} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frete">Frete (R$) <span className="text-red-500">*</span></Label>
              <Input type="number" step="0.01" id="frete" name="frete" value={formData.frete} onChange={handleChange} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pedagio">Pedágio (R$)</Label>
              <Input type="number" step="0.01" id="pedagio" name="pedagio" value={formData.pedagio} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label>Total (Calculado)</Label>
              <Input value={`R$ ${((parseFloat(formData.frete||"0") + parseFloat(formData.pedagio||"0"))).toFixed(2)}`} readOnly className="bg-muted font-bold text-[#2ecc71]" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dtaFrete">Data do Frete</Label>
              <Input type="date" id="dtaFrete" name="dtaFrete" value={formData.dtaFrete} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vencimento" className={isPastDue ? "text-red-500 font-bold" : ""}>Vencimento</Label>
              <Input type="date" id="vencimento" name="vencimento" value={formData.vencimento} onChange={handleChange} className={isPastDue ? "border-red-500" : ""} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" name="obs" value={formData.obs} onChange={handleChange} rows={2} />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="bg-[#0a192f] text-white">Salvar Frete</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
