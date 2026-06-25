import React from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "./theme-provider";
import { Moon, Sun, LayoutDashboard, Truck, Fuel } from "lucide-react";
import { Button } from "./ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b h-14 flex items-center bg-[#0a192f] text-white">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="w-6 h-6 rounded bg-[#2ecc71] flex items-center justify-center">
              <Truck className="h-4 w-4 text-[#0a192f]" />
            </div>
            COCA GRAÇAS A DEUS
          </div>
        </div>
        
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <Link href="/fretes">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${location === '/' || location === '/fretes' ? 'bg-[#0a192f] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Truck className="h-4 w-4" />
              Fretes
            </div>
          </Link>
          <Link href="/diesel">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${location === '/diesel' ? 'bg-[#0a192f] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Fuel className="h-4 w-4" />
              Diesel
            </div>
          </Link>
          <Link href="/dashboard">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${location === '/dashboard' ? 'bg-[#0a192f] text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </div>
          </Link>
        </nav>
        
        <div className="p-4 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span className="font-mono">Gestão de Frotas</span>
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="h-8 w-8">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
        <header className="h-14 border-b bg-white dark:bg-slate-900 px-6 flex items-center justify-between shrink-0">
          <h1 className="font-semibold text-foreground text-lg">
            {location === '/' || location === '/fretes' ? 'Gestão de Fretes' : location === '/diesel' ? 'Controle de Diesel' : 'Dashboard Operacional'}
          </h1>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground mr-2 font-mono font-medium">
              Sistema Online
            </div>
            <div className="h-2 w-2 rounded-full bg-[#2ecc71] animate-pulse" />
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
