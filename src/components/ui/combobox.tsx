import { useState, useRef, useEffect, useMemo } from "react";
import { Check } from "lucide-react";
import { cn, focusNextInForm } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  id?: string;
  options: ReadonlyArray<ComboboxOption>;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowCustomValue?: boolean;
}

export function Combobox({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  allowCustomValue = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? value,
    [options, value],
  );

  const filtered = useMemo(() => {
    if (search.trim().length === 0) return [...options];
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  function handleFocus() {
    setOpen(true);
    setSearch(allowCustomValue ? value : "");
  }

  function handleBlur() {
    setOpen(false);
    setSearch("");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextSearch = e.target.value;
    setSearch(nextSearch);
    if (allowCustomValue) {
      onValueChange(nextSearch);
    }
  }

  function selectOption(
    optionValue: string,
    moveFocus: "next" | "previous" | null = null,
  ) {
    onValueChange(optionValue);
    setOpen(false);
    setSearch("");
    const input = inputRef.current;
    if (input == null) return;

    if (moveFocus == null) {
      input.blur();
      return;
    }

    requestAnimationFrame(() => {
      focusNextInForm(input, moveFocus === "previous");
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[highlightIndex];
      if (target != null) {
        selectOption(target.value, e.shiftKey ? "previous" : "next");
      } else if (allowCustomValue) {
        setOpen(false);
        setSearch("");
        if (inputRef.current != null) {
          focusNextInForm(inputRef.current, e.shiftKey);
        }
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      inputRef.current?.blur();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setOpen(false);
      setSearch("");
      if (inputRef.current != null) {
        focusNextInForm(inputRef.current, e.shiftKey);
      }
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        value={open ? search : selectedLabel}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-popover shadow-md">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matches found.
            </div>
          )}
          {filtered.map((option, index) => (
            <div
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center px-3 py-2 text-sm",
                index === highlightIndex && "bg-accent text-accent-foreground",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(option.value)}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <span className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center">
                {option.value === value && <Check className="h-4 w-4" />}
              </span>
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
