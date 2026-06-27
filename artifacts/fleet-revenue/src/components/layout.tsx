import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "./theme-provider";
import { Moon, Sun, LayoutDashboard, Truck, Fuel, Menu, X } from "lucide-react";
import { Button } from "./ui/button";

function NavLinks({ currentLocation, onNavigate }: { currentLocation: string; onNavigate?: () => void }) {
  const isFretes = currentLocation === "/" || currentLocation === "/fretes";
  const isDiesel = currentLocation === "/diesel";
  const isDashboard = currentLocation === "/dashboard";

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      <Link href="/fretes" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isFretes ? "bg-[#0a192f] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          <Truck className="h-4 w-4 shrink-0" />
          Fretes
        </div>
      </Link>
      <Link href="/diesel" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isDiesel ? "bg-[#0a192f] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          <Fuel className="h-4 w-4 shrink-0" />
          Diesel
        </div>
      </Link>
      <Link href="/dashboard" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${isDashboard ? "bg-[#0a192f] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </div>
      </Link>
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="p-4 border-b h-14 flex items-center bg-[#0a192f] text-white shrink-0">
      <div className="flex items-center gap-2 font-bold text-lg tracking-tight min-w-0">
        <div className="w-6 h-6 rounded bg-[#2ecc71] flex items-center justify-center shrink-0">
          <Truck className="h-4 w-4 text-[#0a192f]" />
        </div>
        <span className="truncate">COCA GRAÇAS A DEUS</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle =
    location === "/" || location === "/fretes"
      ? "Gestão de Fretes"
      : location === "/diesel"
      ? "Controle de Diesel"
      : "Dashboard Operacional";

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col shrink-0">
        <SidebarBrand />
        <NavLinks currentLocation={location} />
        <div className="p-4 border-t flex justify-between items-center text-xs text-muted-foreground shrink-0">
          <span className="font-mono">Gestão de Frotas</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-8 w-8"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer panel */}
          <aside className="relative z-50 w-72 max-w-[85vw] bg-card flex flex-col h-full shadow-xl">
            <SidebarBrand />
            <NavLinks
              currentLocation={location}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="p-4 border-t flex justify-between items-center text-xs text-muted-foreground shrink-0">
              <span className="font-mono">Gestão de Frotas</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-8 w-8"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 min-w-0">
        <header className="h-14 border-b bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between shrink-0 gap-2">
          {/* Hamburger — mobile only */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 shrink-0"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <h1 className="font-semibold text-foreground text-base sm:text-lg truncate flex-1">
            {pageTitle}
          </h1>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block text-xs text-muted-foreground font-mono font-medium">
              Sistema Online
            </div>
            <div className="h-2 w-2 rounded-full bg-[#2ecc71] animate-pulse" />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
