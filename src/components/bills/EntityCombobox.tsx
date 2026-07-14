import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MasterForm, type FieldDef } from "@/components/masters/MasterForm";

export interface EntityOption {
  id: string;
  label: string;
  sublabel?: string;
  raw: Record<string, unknown>;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, row: Record<string, unknown> | null) => void;
  options: EntityOption[];
  placeholder?: string;
  addLabel?: string;
  // Master-form config for inline "add new"
  table: string;
  schema: z.ZodTypeAny;
  fields: FieldDef[];
  // key of the display name field to pre-fill from typed query
  nameKey: string;
  disabled?: boolean;
}

export function EntityCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  addLabel = "Add new",
  table,
  schema,
  fields,
  nameKey,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const selected = options.find((o) => o.id === value);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn(!selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 pointer-events-auto" align="start">
          <Command>
            <CommandInput
              placeholder="Search…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.label} ${o.sublabel ?? ""}`}
                    onSelect={() => {
                      onChange(o.id, o.raw);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === o.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{o.label}</span>
                      {o.sublabel ? (
                        <span className="text-xs text-muted-foreground">{o.sublabel}</span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {addLabel}
                  {query ? <span className="ml-1 text-muted-foreground">"{query}"</span> : null}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{addLabel}</DialogTitle>
          </DialogHeader>
          <MasterForm
            table={table}
            schema={schema}
            fields={fields}
            initial={query ? { [nameKey]: query } : null}
            onSaved={(row) => {
              setDialogOpen(false);
              onChange(row.id as string, row);
            }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
