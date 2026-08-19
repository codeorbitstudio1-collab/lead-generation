import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";

const ALL = "all";

const normalize = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, "_");

export default function CategoryCombobox({ value, onChange, className, placeholder = "Select category", dataTestId }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data.categories || [])).catch(() => {});
  }, []);

  const select = (v) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const filtered = categories.filter((c) => !query || c.toLowerCase().includes(query.toLowerCase()));
  const hasCustom = query.trim() && !categories.some((c) => normalize(c) === normalize(query));

  const displayValue = value === ALL ? "All categories" : value ? value.replace(/_/g, " ") : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          data-testid={dataTestId}
          className={cn("w-full justify-between rounded-none bg-[#0A0A0A] border-border", className)}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="rounded-none bg-[#0A0A0A] border-border p-0">
        <Command>
          <CommandInput placeholder="Search or type any category…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matching category</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all" onSelect={() => select(ALL)} className="rounded-none">
                <Check className={cn("mr-2 h-4 w-4", value === ALL ? "opacity-100 text-primary" : "opacity-0")} />
                All categories
              </CommandItem>
              {filtered.map((c) => (
                <CommandItem key={c} value={c} onSelect={() => select(c)} className="rounded-none">
                  <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100 text-primary" : "opacity-0")} />
                  {c.replace(/_/g, " ")}
                </CommandItem>
              ))}
              {hasCustom && (
                <CommandItem
                  value={query.trim()}
                  onSelect={() => select(normalize(query))}
                  className="rounded-none text-primary"
                >
                  <span className="mr-2">＋</span>
                  Use “{query.trim()}” as custom category
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}