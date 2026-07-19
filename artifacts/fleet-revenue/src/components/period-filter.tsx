import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PeriodValue {
  dateFrom: string;
  dateTo: string;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function defaultPeriod(): PeriodValue {
  const today = new Date();
  return {
    dateFrom: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    dateTo:   toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
}) {
  const invalid = value.dateFrom && value.dateTo && value.dateFrom > value.dateTo;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input
            type="date"
            className="h-8 w-[150px] text-xs"
            value={value.dateFrom}
            max={value.dateTo || undefined}
            onChange={e => onChange({ ...value, dateFrom: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input
            type="date"
            className="h-8 w-[150px] text-xs"
            value={value.dateTo}
            min={value.dateFrom || undefined}
            onChange={e => onChange({ ...value, dateTo: e.target.value })}
          />
        </div>
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          A data fim não pode ser anterior à data início.
        </p>
      )}
      {(!value.dateFrom || !value.dateTo) && (
        <p className="text-xs text-muted-foreground">
          Preencha as duas datas para filtrar o período.
        </p>
      )}
    </div>
  );
}
