/**
 * OneDriveBackupButton — header icon that opens the OneDrive Backup Settings panel.
 *
 * Features:
 *  - Microsoft OAuth sign-in / sign-out via MSAL popup
 *  - Auto-upload today's backup on page load (background, silent)
 *  - Manual "Backup agora" trigger
 *  - Offline upload queue (filenames stored in localStorage, flushed when online)
 *  - List of backups in OneDrive with download / restore actions
 *  - Graceful "needs setup" state when VITE_AZURE_CLIENT_ID is not configured
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  Cloud,
  CloudOff,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Download,
  RotateCcw,
  ExternalLink,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  isConfigured,
  signIn,
  signOut,
  getAccount,
  getMsal,
  listOneDriveBackups,
  uploadBackup,
  downloadBackup,
  fileExists,
  enqueue,
  dequeue,
  getQueue,
  type ODFile,
} from "@/lib/onedrive";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthState = "loading" | "signed-out" | "signed-in";
type UploadState = "idle" | "uploading" | "done" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUTO_ENABLED_KEY = "lafer-onedrive-auto";

function isAutoEnabled(): boolean {
  return localStorage.getItem(AUTO_ENABLED_KEY) !== "false";
}

function setAutoEnabled(v: boolean): void {
  localStorage.setItem(AUTO_ENABLED_KEY, v ? "true" : "false");
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

async function fetchAndUploadBackup(
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const dlRes = await apiFetch(`/api/backup/download/${encodeURIComponent(filename)}`);
  if (!dlRes.ok) throw new Error(`Download local falhou: ${dlRes.status}`);
  const blob = await dlRes.blob();
  await uploadBackup(filename, blob, onProgress);
}

async function triggerAndGetFilename(): Promise<string | null> {
  try {
    const res = await apiFetch("/api/backup", { method: "POST" });
    if (!res.ok) return null;
    const json = (await res.json()) as { filename?: string };
    return json.filename ?? null;
  } catch {
    return null;
  }
}

async function getLatestFilename(): Promise<string | null> {
  try {
    const res = await apiFetch("/api/backup");
    if (!res.ok) return null;
    const json = (await res.json()) as { backups?: { filename: string }[] };
    return json.backups?.[0]?.filename ?? null;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OneDriveBackupButton() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [userName, setUserName] = useState<string | null>(null);
  const [autoEnabled, setAutoEnabledState] = useState(isAutoEnabled);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [lastUpload, setLastUpload] = useState<string | null>(
    () => localStorage.getItem("lafer-onedrive-last-upload"),
  );
  const [odFiles, setOdFiles] = useState<ODFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [restoreTarget, setRestoreTarget] = useState<ODFile | null>(null);
  const [restoring, setRestoring] = useState(false);
  const autoRanRef = useRef(false);

  // ── Refresh auth state ───────────────────────────────────────────────────
  const refreshAuth = useCallback(async () => {
    if (!isConfigured) { setAuthState("signed-out"); return; }
    await getMsal();
    const account = await getAccount();
    if (account) {
      setAuthState("signed-in");
      setUserName(account.name ?? account.username ?? null);
    } else {
      setAuthState("signed-out");
    }
  }, []);

  // ── Load OneDrive file list ───────────────────────────────────────────────
  const refreshFileList = useCallback(async () => {
    if (authState !== "signed-in") return;
    setLoadingFiles(true);
    try {
      const files = await listOneDriveBackups();
      setOdFiles(files);
    } catch {
      // silently ignore; user can retry manually
    } finally {
      setLoadingFiles(false);
    }
  }, [authState]);

  // ── Online/offline events ─────────────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      // flush queue
      if (authState === "signed-in") flushQueue();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  });

  // ── Flush offline queue ───────────────────────────────────────────────────
  const flushQueue = useCallback(async () => {
    const queue = getQueue();
    for (const filename of queue) {
      try {
        const alreadyUploaded = await fileExists(filename);
        if (!alreadyUploaded) {
          await fetchAndUploadBackup(filename);
        }
        dequeue(filename);
      } catch {
        // leave in queue, retry next time
      }
    }
  }, []);

  // ── Auto-upload on mount ──────────────────────────────────────────────────
  const autoUpload = useCallback(async () => {
    if (autoRanRef.current || !autoEnabled || !navigator.onLine) return;
    autoRanRef.current = true;
    try {
      let filename = await getLatestFilename();
      if (!filename) filename = await triggerAndGetFilename();
      if (!filename) return;

      const alreadyUploaded = await fileExists(filename);
      if (alreadyUploaded) {
        setLastUpload(filename);
        localStorage.setItem("lafer-onedrive-last-upload", filename);
        return;
      }

      await fetchAndUploadBackup(filename);
      setLastUpload(filename);
      localStorage.setItem("lafer-onedrive-last-upload", filename);
    } catch {
      // silent — user can trigger manually
    }
  }, [autoEnabled]);

  // Mount: init auth, then auto-upload if signed in
  useEffect(() => {
    refreshAuth().then(async () => {
      const account = await getAccount();
      if (account) {
        await flushQueue();
        await autoUpload();
      }
    });
  }, [refreshAuth, autoUpload, flushQueue]);

  // Load file list when panel opens
  useEffect(() => {
    if (open && authState === "signed-in") refreshFileList();
  }, [open, authState, refreshFileList]);

  // ── Sign in ───────────────────────────────────────────────────────────────
  const handleSignIn = useCallback(async () => {
    try {
      setAuthState("loading");
      const account = await signIn();
      setAuthState("signed-in");
      setUserName(account.name ?? account.username ?? null);
      toast({ title: "Conectado ao OneDrive", description: account.username });
      autoRanRef.current = false;
      await autoUpload();
    } catch (err: unknown) {
      setAuthState("signed-out");
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("user_cancelled") && !msg.includes("popup_window_error")) {
        toast({ title: "Falha na autenticação", description: msg, variant: "destructive" });
      }
    }
  }, [autoUpload, toast]);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // ignore
    }
    setAuthState("signed-out");
    setUserName(null);
    setOdFiles([]);
    toast({ title: "OneDrive desconectado" });
  }, [toast]);

  // ── Manual backup ─────────────────────────────────────────────────────────
  const handleManualBackup = useCallback(async () => {
    if (uploadState === "uploading") return;
    setUploadState("uploading");
    setUploadPct(0);
    try {
      // Generate fresh backup on server first
      const filename = await triggerAndGetFilename();
      if (!filename) throw new Error("Backup não gerado");

      if (!navigator.onLine) {
        enqueue(filename);
        setUploadState("idle");
        toast({
          title: "Backup na fila",
          description: "Sem conexão — será enviado ao OneDrive quando voltar online.",
        });
        return;
      }

      await fetchAndUploadBackup(filename, (pct) => setUploadPct(pct));
      setLastUpload(filename);
      localStorage.setItem("lafer-onedrive-last-upload", filename);
      setUploadState("done");
      toast({ title: "Backup enviado ao OneDrive", description: filename });
      await refreshFileList();
      setTimeout(() => setUploadState("idle"), 3000);
    } catch (err: unknown) {
      setUploadState("error");
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Falha no backup", description: msg, variant: "destructive" });
      setTimeout(() => setUploadState("idle"), 5000);
    }
  }, [uploadState, refreshFileList, toast]);

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = useCallback(
    async (file: ODFile) => {
      setRestoring(true);
      try {
        toast({ title: "Baixando backup…", description: file.name });
        const blob = await downloadBackup(file);

        toast({ title: "Importando dados…", description: "Aguarde, isso pode levar alguns segundos." });
        const res = await apiFetch("/api/backup/restore", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }

        const result = (await res.json()) as {
          fretes: number;
          abastecimentos: number;
          despesas: number;
        };

        toast({
          title: "Restauração concluída",
          description: `${result.fretes} fretes, ${result.abastecimentos} abastecimentos e ${result.despesas} despesas restaurados.`,
        });
        // Invalidate all queries so the UI refreshes
        await queryClient.invalidateQueries();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro na restauração";
        toast({ title: "Falha na restauração", description: msg, variant: "destructive" });
      } finally {
        setRestoring(false);
        setRestoreTarget(null);
      }
    },
    [toast, queryClient],
  );

  // ── Toggle auto-backup ────────────────────────────────────────────────────
  const toggleAuto = useCallback((checked: boolean) => {
    setAutoEnabledState(checked);
    setAutoEnabled(checked);
  }, []);

  // ── Header button icon / state ────────────────────────────────────────────

  const headerIcon =
    authState === "loading"   ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
    uploadState === "uploading" ? <CloudUpload className="h-4 w-4 text-[#0078D4] animate-pulse" /> :
    authState === "signed-in" && uploadState === "done" ? <CheckCircle2 className="h-4 w-4 text-[#2ecc71]" /> :
    authState === "signed-in"  ? <Cloud className="h-4 w-4 text-[#0078D4]" /> :
                                  <CloudOff className="h-4 w-4 text-muted-foreground" />;

  const tooltipText =
    authState === "loading"    ? "Verificando OneDrive…" :
    authState === "signed-out" ? "Conectar ao OneDrive para backups na nuvem" :
    uploadState === "uploading" ? "Enviando backup ao OneDrive…" :
    uploadState === "done"     ? `Backup enviado: ${lastUpload ?? ""}` :
                                  `OneDrive: ${userName ?? "conectado"}`;

  return (
    <>
      {/* ── Restore confirmation dialog ─────────────────────────────────── */}
      <AlertDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(o) => { if (!o && !restoring) setRestoreTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar dados?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso <strong>substituirá todos os dados atuais</strong> (fretes e
              abastecimentos) pelos dados do arquivo{" "}
              <strong>{restoreTarget?.name}</strong>. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => restoreTarget && handleRestore(restoreTarget)}
            >
              {restoring ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restaurando…</>
              ) : (
                "Sim, restaurar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Header button ───────────────────────────────────────────────── */}
      <Sheet open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Backup OneDrive"
                >
                  {headerIcon}
                </Button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {tooltipText}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* ── Settings panel ──────────────────────────────────────────── */}
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] flex flex-col gap-0 p-0"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-[#0078D4]" />
              Backup OneDrive
            </SheetTitle>
            <SheetDescription>
              Backups automáticos na nuvem Microsoft OneDrive.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-6">

              {/* ── Offline banner ──────────────────────────────────────── */}
              {!isOnline && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <WifiOff className="h-4 w-4 shrink-0" />
                  <span>Sem conexão — uploads serão enviados quando voltar online.</span>
                </div>
              )}

              {/* ── Connection section ──────────────────────────────────── */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Conta Microsoft
                </h3>

                {authState === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando autenticação…
                  </div>
                )}

                {authState === "signed-out" && !isConfigured && (
                  <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 space-y-2">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Configuração necessária
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Para ativar o backup no OneDrive, o responsável técnico deve:
                    </p>
                    <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal pl-4">
                      <li>Registrar um aplicativo no <strong>portal.azure.com</strong> (Azure Active Directory → Registros de aplicativos → Novo registro)</li>
                      <li>Em <strong>Autenticação</strong>, adicionar o tipo "SPA" com a URL do sistema como URI de redirecionamento</li>
                      <li>Em <strong>Permissões de API</strong>, adicionar <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">Files.ReadWrite</code> do Microsoft Graph</li>
                      <li>Copiar o <strong>ID do aplicativo (cliente)</strong> e adicioná-lo nas variáveis de ambiente como <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">VITE_AZURE_CLIENT_ID</code></li>
                    </ol>
                  </div>
                )}

                {authState === "signed-out" && isConfigured && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Conecte sua conta Microsoft para sincronizar backups com o OneDrive.
                    </p>
                    <Button
                      onClick={handleSignIn}
                      className="gap-2 bg-[#0078D4] hover:bg-[#106ebe] text-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Entrar com Microsoft
                    </Button>
                  </div>
                )}

                {authState === "signed-in" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-[#2ecc71] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{userName ?? "Conta conectada"}</p>
                          <p className="text-xs text-muted-foreground">OneDrive / LAFER Backups</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={handleSignOut}
                      >
                        Desconectar
                      </Button>
                    </div>

                    {lastUpload && (
                      <p className="text-xs text-muted-foreground">
                        Último backup enviado: <span className="font-mono">{lastUpload}</span>
                      </p>
                    )}
                  </div>
                )}
              </section>

              <Separator />

              {/* ── Auto-backup toggle ──────────────────────────────────── */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Backup automático</p>
                    <p className="text-xs text-muted-foreground">
                      Envia o backup do dia ao abrir o sistema.
                    </p>
                  </div>
                  <Switch
                    checked={autoEnabled}
                    onCheckedChange={toggleAuto}
                    disabled={authState !== "signed-in"}
                  />
                </div>
              </section>

              {/* ── Manual backup button ────────────────────────────────── */}
              {authState === "signed-in" && (
                <>
                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Backup manual</h3>
                    <Button
                      className="w-full gap-2"
                      onClick={handleManualBackup}
                      disabled={uploadState === "uploading"}
                    >
                      {uploadState === "uploading" ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                      ) : uploadState === "done" ? (
                        <><CheckCircle2 className="h-4 w-4" /> Enviado!</>
                      ) : uploadState === "error" ? (
                        <><AlertCircle className="h-4 w-4" /> Tentar novamente</>
                      ) : (
                        <><CloudUpload className="h-4 w-4" /> Fazer Backup Agora</>
                      )}
                    </Button>
                    {uploadState === "uploading" && (
                      <Progress value={uploadPct} className="h-1.5" />
                    )}
                  </section>

                  <Separator />

                  {/* ── Backup list ──────────────────────────────────────── */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Backups no OneDrive</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={refreshFileList}
                        disabled={loadingFiles}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
                      </Button>
                    </div>

                    {loadingFiles && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando…
                      </div>
                    )}

                    {!loadingFiles && odFiles.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum backup encontrado no OneDrive.
                      </p>
                    )}

                    {!loadingFiles && odFiles.length > 0 && (
                      <div className="space-y-2">
                        {odFiles.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center gap-2 rounded-md border px-3 py-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono font-medium truncate">{f.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {fmtSize(f.size)} · {fmtDt(f.lastModifiedDateTime)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Download to computer */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={async () => {
                                        try {
                                          const blob = await downloadBackup(f);
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement("a");
                                          a.href = url;
                                          a.download = f.name;
                                          a.click();
                                          URL.revokeObjectURL(url);
                                        } catch (err: unknown) {
                                          toast({
                                            title: "Falha no download",
                                            description: err instanceof Error ? err.message : "Erro",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    Baixar arquivo
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {/* Restore */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => setRestoreTarget(f)}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    Restaurar dados deste backup
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* ── Setup instructions (signed out) ────────────────────── */}
              {authState === "signed-out" && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">Como configurar</h3>
                    <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
                      <li>Entre com sua conta Microsoft acima.</li>
                      <li>Uma pasta <strong>LAFER Backups</strong> será criada automaticamente no seu OneDrive.</li>
                      <li>Os backups diários serão enviados automaticamente toda vez que o sistema abrir.</li>
                    </ol>
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
