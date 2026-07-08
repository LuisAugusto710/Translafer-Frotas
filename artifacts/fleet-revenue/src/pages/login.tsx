import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

function LaferLogo({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="LAFER"
    >
      <polygon points="6,4 13,4 11,22 26,22 26,28 4,28 6,22" fill="white" />
      <polygon points="10,10 27,5 28,11 11,16" fill="#C4A44A" />
    </svg>
  );
}

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#1e3a5f] via-[#0f2744] to-[#0b1929] p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <LaferLogo size={44} />
            <span className="text-3xl font-bold tracking-widest text-white">
              LAFER
            </span>
          </div>
          <p className="text-sm text-slate-400 tracking-wide">
            Gestão de Frotas
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 sm:p-8">
          <h1 className="text-lg font-semibold text-foreground mb-1">
            Entrar
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Acesse sua conta para continuar.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMe(v === true)}
                disabled={submitting}
              />
              <Label
                htmlFor="remember"
                className="text-sm font-normal cursor-pointer select-none"
              >
                Manter conectado
              </Label>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-white"
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} LAFER · Sistema de Gestão de Frotas
        </p>
      </div>
    </div>
  );
}
