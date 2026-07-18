import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaskedDateInput } from "@/components/masked-date-input";
import { createManutencao, updateManutencao } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Trash2, Download, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

const TIPOS = ["Preventiva", "Corretiva", "Emergencial"] as const;
const CATEGORIAS = [
  "Motor", "Transmissão", "Freios", "Pneus", "Elétrico",
  "Suspensão", "Arrefecimento", "Combustível", "Lubrificação",
  "Funilaria", "Ar Condicionado", "Bateria", "Filtros",
  "Manutenção Geral", "Outro",
] as const;

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE_MB = 10;

type ManutencaoRow = {
  id: number;
  dataManutencao: string | null;
  frota: string;
  km: number;
  tipo: string;
  procedimento: string;
  categoria: string;
  oficina: string;
  custo: number;
  obs: string | null;
  temAnexo: boolean;
  anexoNome?: string | null;
  anexoTipo?: string | null;
};

type AnexoPending = { nome: string; tipo: string; dados: string } | null;

export function ManutencaoFormModal({
  open,
  onOpenChange,
  manutencao,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manutencao?: ManutencaoRow;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    dataManutencao: "",
    frota: "",
    km: "",
    tipo: "",
    procedimento: "",
    categoria: "",
    oficina: "",
    custo: "",
    obs: "",
  });

  const [anexoPending, setAnexoPending] = useState<AnexoPending>(null);
  const [removeAnexo, setRemoveAnexo] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [kmLoading, setKmLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setFileError(null);
      setAnexoPending(null);
      setRemoveAnexo(false);
      if (manutencao) {
        setFormData({
          dataManutencao: manutencao.dataManutencao?.split("T")[0] || "",
          frota: manutencao.frota || "",
          km: manutencao.km?.toString() || "",
          tipo: manutencao.tipo || "",
          procedimento: manutencao.procedimento || "",
          categoria: manutencao.categoria || "",
          oficina: manutencao.oficina || "",
          custo: manutencao.custo?.toString() || "",
          obs: manutencao.obs || "",
        });
      } else {
        setFormData({
          dataManutencao: new Date().toISOString().split("T")[0],
          frota: "", km: "", tipo: "", procedimento: "",
          categoria: "", oficina: "", custo: "", obs: "",
        });
      }
    }
  }, [manutencao, open]);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createManutencao>[0]) => createManutencao(data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateManutencao>[1] }) =>
      updateManutencao(id, data),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Arquivo muito grande. Máximo: ${MAX_SIZE_MB}MB.`);
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Strip the data URI prefix ("data:...;base64,") to get pure base64
      const base64 = dataUrl.split(",")[1];
      setAnexoPending({ nome: file.name, tipo: file.type, dados: base64 });
      setRemoveAnexo(false);
      setIsUploading(false);
    };
    reader.onerror = () => {
      setFileError("Erro ao ler o arquivo.");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadExisting = async () => {
    if (!manutencao?.id) return;
    try {
      const res = await apiFetch(`/api/manutencoes/${manutencao.id}/anexo`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = manutencao.anexoNome || "anexo";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro", description: "Não foi possível baixar o anexo.", variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const { dataManutencao, frota, km, tipo, procedimento, categoria, oficina, custo } = formData;
    if (!dataManutencao || !frota || !km || !tipo || !procedimento || !categoria || !oficina || !custo) {
      toast({ title: "Erro de Validação", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const isEditing = !!manutencao?.id;

    const attachmentFields = () => {
      if (removeAnexo) return { anexoNome: null, anexoTipo: null, anexoDados: null };
      if (anexoPending) return { anexoNome: anexoPending.nome, anexoTipo: anexoPending.tipo, anexoDados: anexoPending.dados };
      return {};
    };

    const payload = {
      dataManutencao,
      frota,
      km: parseFloat(km),
      tipo,
      procedimento,
      categoria,
      oficina,
      custo: parseFloat(custo),
      obs: formData.obs || null,
      ...attachmentFields(),
    };

    const onSuccess = () => {
      toast({ title: "Sucesso", description: `Manutenção ${isEditing ? "atualizada" : "criada"} com sucesso.` });
      queryClient.invalidateQueries({ queryKey: ["/api/manutencoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/manutencao-intervalos/preventiva"] });
      onOpenChange(false);
    };

    const onError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Ocorreu um erro ao salvar.";
      toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
    };

    if (isEditing) {
      updateMutation.mutate({ id: manutencao.id, data: payload as any }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload as any, { onSuccess, onError });
    }
  };

  // Auto-fill KM from diesel/maintenance records when frota is entered (new records only)
  const handleFrotaBlur = async () => {
    const frota = formData.frota.trim();
    if (!frota || manutencao || formData.km !== "") return;
    setKmLoading(true);
    try {
      const res = await apiFetch(`/api/frotas/km-atual?frota=${encodeURIComponent(frota)}`);
      if (res.ok) {
        const data = await res.json() as { kmAtual: number | null };
        if (data.kmAtual != null) {
          setFormData(p => ({ ...p, km: String(Math.round(data.kmAtual!)) }));
        }
      }
    } catch {
      // Silently ignore — km stays empty for manual entry
    } finally {
      setKmLoading(false);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || isUploading;
  const hasExistingAnexo = !!manutencao?.temAnexo && !removeAnexo && !anexoPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{manutencao ? "Editar Manutenção" : "Nova Manutenção"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Data da Manutenção */}
            <div className="space-y-2">
              <Label>Data da Manutenção <span className="text-red-500">*</span></Label>
              <MaskedDateInput
                id="dataManutencao"
                name="dataManutencao"
                value={formData.dataManutencao}
                onChange={(iso) => setFormData(p => ({ ...p, dataManutencao: iso }))}
                required
              />
            </div>

            {/* Frota */}
            <div className="space-y-2">
              <Label htmlFor="frota">Frota <span className="text-red-500">*</span></Label>
              <Input
                id="frota" value={formData.frota}
                onChange={e => setFormData(p => ({ ...p, frota: e.target.value }))}
                onBlur={handleFrotaBlur}
                placeholder="Ex: 1118" required
              />
            </div>

            {/* KM */}
            <div className="space-y-2">
              <Label htmlFor="km">
                Odômetro (KM) <span className="text-red-500">*</span>
                {kmLoading && <span className="ml-2 text-xs text-muted-foreground animate-pulse">buscando…</span>}
              </Label>
              <Input
                id="km" type="number" step="0.01" min="0"
                value={formData.km}
                onChange={e => setFormData(p => ({ ...p, km: e.target.value }))}
                placeholder="Ex: 125000" required
                disabled={kmLoading}
              />
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Manutenção <span className="text-red-500">*</span></Label>
              <Select value={formData.tipo} onValueChange={v => setFormData(p => ({ ...p, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Procedimento */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="procedimento">Procedimento Realizado <span className="text-red-500">*</span></Label>
              <Input
                id="procedimento" value={formData.procedimento}
                onChange={e => setFormData(p => ({ ...p, procedimento: e.target.value }))}
                placeholder="Ex: Troca de óleo, Freios, Embreagem…" required
              />
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <Label>Categoria <span className="text-red-500">*</span></Label>
              <Select value={formData.categoria} onValueChange={v => setFormData(p => ({ ...p, categoria: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Oficina */}
            <div className="space-y-2">
              <Label htmlFor="oficina">Oficina / Fornecedor <span className="text-red-500">*</span></Label>
              <Input
                id="oficina" value={formData.oficina}
                onChange={e => setFormData(p => ({ ...p, oficina: e.target.value }))}
                placeholder="Nome da oficina ou fornecedor" required
              />
            </div>

            {/* Custo */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="custo">Custo Total (R$) <span className="text-red-500">*</span></Label>
              <Input
                id="custo" type="number" step="0.01" min="0"
                value={formData.custo}
                onChange={e => setFormData(p => ({ ...p, custo: e.target.value }))}
                placeholder="Ex: 1500.00" required
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs" rows={3} value={formData.obs}
              onChange={e => setFormData(p => ({ ...p, obs: e.target.value }))}
              placeholder="Peças substituídas, garantia, próxima manutenção…"
            />
          </div>

          {/* Anexo */}
          <div className="space-y-2">
            <Label>Anexo (PDF, JPG, PNG)</Label>

            {hasExistingAnexo && (
              <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/40 text-sm">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-muted-foreground">{manutencao?.anexoNome || "Arquivo anexado"}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={handleDownloadExisting}>
                  <Download className="h-3.5 w-3.5" /> Baixar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1 text-red-500 hover:text-red-600"
                  onClick={() => setRemoveAnexo(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
            )}

            {removeAnexo && (
              <div className="flex items-center gap-2 p-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 text-sm text-red-600">
                <Trash2 className="h-4 w-4 shrink-0" />
                <span className="flex-1">Anexo será removido ao salvar.</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setRemoveAnexo(false)}>
                  Desfazer
                </Button>
              </div>
            )}

            {anexoPending && (
              <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-sm">
                <Paperclip className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="truncate flex-1 text-emerald-700">{anexoPending.nome}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-red-500"
                  onClick={() => { setAnexoPending(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {!hasExistingAnexo && !removeAnexo && !anexoPending && (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Clique para selecionar um arquivo</span>
                <span className="text-xs text-muted-foreground">PDF, JPG, PNG · máx {MAX_SIZE_MB}MB</span>
              </div>
            )}

            {(hasExistingAnexo || removeAnexo) && !anexoPending && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full"
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Substituir anexo
              </Button>
            )}

            <input
              ref={fileInputRef} type="file" accept={ACCEPT}
              className="hidden" onChange={handleFileChange}
            />
            {fileError && <p className="text-xs text-red-500">{fileError}</p>}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading} className="bg-[#0a192f] text-white">
              {isLoading ? "Salvando…" : "Salvar Manutenção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
