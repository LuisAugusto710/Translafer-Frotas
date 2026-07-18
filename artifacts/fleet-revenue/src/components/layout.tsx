import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Truck, Fuel, Wallet, Users, Wrench, Menu, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { BackupFolderButton } from "./backup-folder-button";
import { OneDriveBackupButton } from "./onedrive-backup-button";
import { NormalizeTextButton } from "./normalize-text-button";
import { useAuth } from "@/lib/auth-context";

function NavLinks({ currentLocation, onNavigate }: { currentLocation: string; onNavigate?: () => void }) {
  const isFretes = currentLocation === "/" || currentLocation === "/fretes";
  const isDiesel = currentLocation === "/diesel";
  const isDespesas = currentLocation === "/despesas";
  const isFuncionarios = currentLocation === "/funcionarios";
  const isManutencao = currentLocation === "/manutencao";
  const isDashboard = currentLocation === "/dashboard";

  const active = "bg-white/[0.08] text-white font-semibold";
  const inactive = "text-sidebar-foreground hover:bg-white/[0.05] hover:text-white/90 font-medium";

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      <Link href="/fretes" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${isFretes ? active : inactive}`}>
          <Truck className="h-4 w-4 shrink-0" />
          Fretes
        </div>
      </Link>
      <Link href="/diesel" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${isDiesel ? active : inactive}`}>
          <Fuel className="h-4 w-4 shrink-0" />
          Diesel
        </div>
      </Link>
      <Link href="/despesas" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${isDespesas ? active : inactive}`}>
          <Wallet className="h-4 w-4 shrink-0" />
          Despesas
        </div>
      </Link>
      <Link href="/funcionarios" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${isFuncionarios ? active : inactive}`}>
          <Users className="h-4 w-4 shrink-0" />
          Funcionários
        </div>
      </Link>
      <Link href="/manutencao" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${isManutencao ? active : inactive}`}>
          <Wrench className="h-4 w-4 shrink-0" />
          Manutenção
        </div>
      </Link>
      <Link href="/dashboard" onClick={onNavigate}>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${isDashboard ? active : inactive}`}>
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </div>
      </Link>
    </nav>
  );
}

function LaferLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="LAFER">
      {/* Stylised italic L — white, designed for dark sidebar background */}
      <polygon points="6,4 13,4 11,22 26,22 26,28 4,28 6,22" fill="white"/>
      {/* Gold diagonal swoosh accent */}
      <polygon points="10,10 27,5 28,11 11,16" fill="#C4A44A"/>
    </svg>
  );
}

function SidebarBrand() {
  return (
    <div className="p-4 border-b border-sidebar-border h-14 flex items-center bg-sidebar text-white shrink-0">
      <div className="flex items-center gap-2 font-bold text-lg tracking-tight min-w-0">
        <LaferLogo size={28} />
        <span className="truncate tracking-widest">LAFER</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle =
    location === "/" || location === "/fretes"
      ? "Gestão de Fretes"
      : location === "/diesel"
      ? "Controle de Diesel"
      : location === "/despesas"
      ? "Gestão de Despesas"
      : location === "/funcionarios"
      ? "Funcionários"
      : location === "/manutencao"
      ? "Manutenção de Frota"
      : "Dashboard Operacional";

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-sidebar-border bg-sidebar flex-col shrink-0">
        <SidebarBrand />
        <NavLinks currentLocation={location} />
        <div className="p-4 border-t border-sidebar-border flex items-center text-xs text-sidebar-foreground shrink-0">
          <span className="font-mono">Gestão de Frotas</span>
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
          <aside className="relative z-50 w-72 max-w-[85vw] bg-sidebar flex flex-col h-full shadow-xl">
            <SidebarBrand />
            <NavLinks
              currentLocation={location}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="p-4 border-t border-sidebar-border flex items-center text-xs text-sidebar-foreground shrink-0">
              <span className="font-mono">Gestão de Frotas</span>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background min-w-0">
        <header className="h-14 border-b bg-card px-4 sm:px-6 flex items-center justify-between shrink-0 gap-2">
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
            <span className="hidden sm:contents">
              <NormalizeTextButton />
              <OneDriveBackupButton />
              <BackupFolderButton />
            </span>
            {user?.email && (
              <span className="hidden lg:inline text-xs text-muted-foreground font-mono max-w-[180px] truncate">
                {user.email}
              </span>
            )}
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
