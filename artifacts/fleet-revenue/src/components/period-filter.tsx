import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface PeriodValue {
  dateFrom: string;
  dateTo: string;
}

type Preset = "today" | "week" | "month" | "year" | "custom";

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetDates(preset: Preset): PeriodValue {
  const today = new Date();
  const todayStr = toIso(today);
  switch (preset) {
    case "today":
      return { dateFrom: todayStr, dateTo: todayStr };
    case "week": {
      const dow = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dow);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { dateFrom: toIso(start), dateTo: toIso(end) };
    }
    case "month":
      return {
        dateFrom: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
        dateTo: toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case "year":
      return {
        dateFrom: `${today.getFullYear()}-01-01`,
        dateTo: `${today.getFullYear()}-12-31`,
      };
    case "custom":
    default:
      return { dateFrom: "", dateTo: "" };
  }
}

export function defaultPeriod(): PeriodValue {
  return presetDates("month");
}

export function defaultYearPeriod(): PeriodValue {
  return presetDates("year");
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "week",  label: "Esta Semana" },
  { key: "month", label: "Este Mês" },
  { key: "year",  label: "Este Ano" },
  { key: "custom", label: "Personalizado" },
];

export function PeriodFilter({
  value,
  onChange,
  defaultPreset = "month",
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  defaultPreset?: Preset;
}) {
  const [activePreset, setActivePreset] = useState<Preset>(defaultPreset);

  function handlePreset(p: Preset) {
    setActivePreset(p);
    if (p !== "custom") {
      onChange(presetDates(p));
    }
  }

  const invalid =
    activePreset === "custom" &&
    !!value.dateFrom &&
    !!value.dateTo &&
    value.dateFrom > value.dateTo;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={activePreset === p.key ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {activePreset === "custom" && (
        <div className="flex flex-wrap items-end gap-3 pt-0.5">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Data início</Label>
            <Input
              type="date"
              className="h-8 w-[150px] text-xs"
              value={value.dateFrom}
              max={value.dateTo || undefined}
              onChange={e => onChange({ ...value, dateFrom: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Data fim</Label>
            <Input
              type="date"
              className="h-8 w-[150px] text-xs"
              value={value.dateTo}
              min={value.dateFrom || undefined}
              onChange={e => onChange({ ...value, dateTo: e.target.value })}
            />
          </div>
        </div>
      )}

      {invalid && (
        <p className="text-xs text-destructive">
          A data fim não pode ser anterior à data início.
        </p>
      )}
      {activePreset === "custom" && (!value.dateFrom || !value.dateTo) && (
        <p className="text-xs text-muted-foreground">
          Preencha as duas datas para filtrar o período.
        </p>
      )}
    </div>
  );
}
