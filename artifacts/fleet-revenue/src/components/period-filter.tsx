import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PeriodPreset = "hoje" | "semana" | "mes" | "ano" | "custom";

export interface PeriodValue {
  preset: PeriodPreset;
  dateFrom: string;
  dateTo: string;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computePeriodRange(preset: PeriodPreset, customFrom?: string, customTo?: string): { dateFrom: string; dateTo: string } {
  const today = new Date();

  if (preset === "custom") {
    return { dateFrom: customFrom || toIso(today), dateTo: customTo || toIso(today) };
  }

  if (preset === "hoje") {
    const iso = toIso(today);
    return { dateFrom: iso, dateTo: iso };
  }

  if (preset === "semana") {
    const dow = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { dateFrom: toIso(start), dateTo: toIso(end) };
  }

  if (preset === "mes") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dateFrom: toIso(start), dateTo: toIso(end) };
  }

  // ano
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  return { dateFrom: toIso(start), dateTo: toIso(end) };
}

export function defaultPeriodValue(preset: PeriodPreset = "mes"): PeriodValue {
  const { dateFrom, dateTo } = computePeriodRange(preset);
  return { preset, dateFrom, dateTo };
}

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta Semana" },
  { value: "mes", label: "Este Mês" },
  { value: "ano", label: "Este Ano" },
  { value: "custom", label: "Personalizado" },
];

export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
}) {
  function selectPreset(preset: PeriodPreset) {
    if (preset === "custom") {
      onChange({ preset, dateFrom: value.dateFrom, dateTo: value.dateTo });
      return;
    }
    const range = computePeriodRange(preset);
    onChange({ preset, ...range });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(p => (
          <Button
            key={p.value}
            type="button"
            size="sm"
            variant={value.preset === p.value ? "default" : "outline"}
            className="h-8 text-xs px-3"
            onClick={() => selectPreset(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input
              type="date"
              className="h-8 w-[140px] text-xs"
              value={value.dateFrom}
              max={value.dateTo}
              onChange={e => onChange({ ...value, dateFrom: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input
              type="date"
              className="h-8 w-[140px] text-xs"
              value={value.dateTo}
              min={value.dateFrom}
              onChange={e => onChange({ ...value, dateTo: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
