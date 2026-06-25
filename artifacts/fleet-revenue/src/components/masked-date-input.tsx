import { useState, useEffect, useRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface MaskedDateInputProps {
  value: string;
  onChange: (isoValue: string) => void;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  errorClassName?: string;
}

function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts;
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function validateDate(day: number, month: number, year: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export const MaskedDateInput = forwardRef<HTMLInputElement, MaskedDateInputProps>(
  ({ value, onChange, className, id, name, required, placeholder = "DD/MM/AAAA", errorClassName }, ref) => {
    const [focused, setFocused] = useState(false);
    const [display, setDisplay] = useState(() => isoToDisplay(value));
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const combinedRef = (node: HTMLInputElement | null) => {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    useEffect(() => {
      if (!focused) {
        setDisplay(isoToDisplay(value));
        if (value) setError(null);
      }
    }, [value, focused]);

    const applyMask = (raw: string): string => {
      const digits = raw.replace(/\D/g, "").slice(0, 8);
      let masked = digits.slice(0, 2);
      if (digits.length > 2) masked += "/" + digits.slice(2, 4);
      if (digits.length > 4) masked += "/" + digits.slice(4, 8);
      return masked;
    };

    const processValue = (masked: string) => {
      const digits = masked.replace(/\D/g, "");
      if (digits.length === 8) {
        const d = parseInt(digits.slice(0, 2), 10);
        const m = parseInt(digits.slice(2, 4), 10);
        const y = parseInt(digits.slice(4, 8), 10);
        if (validateDate(d, m, y)) {
          setError(null);
          onChange(
            `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
          );
        } else {
          setError("Data inválida");
          onChange("");
        }
      } else if (digits.length > 0) {
        setError(null);
        onChange("");
      } else {
        setError(null);
        onChange("");
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const prevDigits = display.replace(/\D/g, "");
      const newDigits = raw.replace(/\D/g, "");

      if (newDigits.length > 8) return;

      const masked = applyMask(raw);
      setDisplay(masked);
      processValue(masked);

      requestAnimationFrame(() => {
        if (inputRef.current) {
          const pos = masked.length;
          inputRef.current.setSelectionRange(pos, pos);
        }
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key !== "Backspace" &&
        e.key !== "Delete" &&
        e.key !== "Tab" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowRight" &&
        e.key !== "Home" &&
        e.key !== "End" &&
        !/^\d$/.test(e.key)
      ) {
        e.preventDefault();
      }
    };

    const handleBlur = () => {
      setFocused(false);
      const digits = display.replace(/\D/g, "");
      if (digits.length > 0 && digits.length < 8) {
        setError("Data incompleta");
      } else if (digits.length === 0) {
        setError(null);
      }
    };

    const hasError = !!error;

    return (
      <div className="space-y-1">
        <input
          ref={combinedRef}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          value={display}
          placeholder={placeholder}
          required={required}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          autoComplete="off"
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            hasError && "border-red-500 focus-visible:ring-red-500",
            className
          )}
        />
        {hasError && (
          <p className={cn("text-xs text-red-500", errorClassName)}>{error}</p>
        )}
      </div>
    );
  }
);

MaskedDateInput.displayName = "MaskedDateInput";
