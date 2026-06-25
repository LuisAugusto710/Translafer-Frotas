import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatNumber(value: number | undefined | null, maximumFractionDigits = 2) {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value);
}

export function formatDate(dateString: string | undefined | null) {
  if (!dateString) return "-";
  try {
    const d = new Date(dateString);
    // Add timezone offset to display correct date
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    return new Intl.DateTimeFormat('pt-BR').format(d);
  } catch (e) {
    return dateString;
  }
}
