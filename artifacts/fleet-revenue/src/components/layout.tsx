import React from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "./theme-provider";
import { Moon, Sun, LayoutDashboard, TableProperties, Settings } from "lucide-react";
import { Button } from "./ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b h-14 flex items-center">
          <div className="flex items-center gap-2 font-bold text-lg text-primary tracking-tight">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs leading-none">F</span>
            </div>
            FleetRev
          </div>
        </div>
        
        <nav className="flex-1 p-3 space-y-1">
          <Link href="/">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${location === '/' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <TableProperties className="h-4 w-4" />
              Data Entry
            </div>
          </Link>
          <Link href="/dashboard">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${location === '/dashboard' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </div>
          </Link>
        </nav>
        
        <div className="p-4 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span className="font-mono">v1.0.0</span>
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="h-8 w-8">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-14 border-b bg-card px-6 flex items-center justify-between shrink-0">
          <h1 className="font-semibold text-foreground">
            {location === '/' ? 'Trip Ledger' : 'Performance Dashboard'}
          </h1>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground mr-2 font-mono">
              Live Data
            </div>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-background p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
