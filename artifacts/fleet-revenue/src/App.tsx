import { Switch, Route, Router as WouterRouter } from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import { Dashboard } from "@/pages/dashboard";
import { Fretes } from "@/pages/fretes";
import { Diesel } from "@/pages/diesel";
import { Login } from "@/pages/login";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { UNAUTHORIZED_EVENT } from "@/lib/api-fetch";

function notifyIfUnauthorized(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
  queryCache: new QueryCache({ onError: notifyIfUnauthorized }),
  mutationCache: new MutationCache({ onError: notifyIfUnauthorized }),
});

function AuthedRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Fretes} />
        <Route path="/fretes" component={Fretes} />
        <Route path="/diesel" component={Diesel} />
        <Route path="/dashboard" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Gate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a192f]">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AuthedRoutes />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="fleet-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Gate />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
