import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "switch" | "email" | "select";
  colSpan?: 1 | 2;
  placeholder?: string;
  options?: string[];
}

interface MasterFormProps<S extends z.ZodTypeAny> {
  table: string;
  schema: S;
  fields: FieldDef[];
  initial?: Record<string, unknown> | null;
  onSaved?: (row: Record<string, unknown>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  extraFooter?: ReactNode;
}

export function MasterForm<S extends z.ZodTypeAny>({
  table,
  schema,
  fields,
  initial,
  onSaved,
  onCancel,
  submitLabel = "Save",
}: MasterFormProps<S>) {
  const qc = useQueryClient();
  const defaults = Object.fromEntries(
    fields.map((f) => [
      f.key,
      initial?.[f.key] ??
        (f.type === "switch" ? false : f.type === "number" ? 0 : ""),
    ]),
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults as never,
  });

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = { ...values };
      if (initial?.id) {
        const { data, error } = await supabase
          .from(table as never)
          .update(payload as never)
          .eq("id", initial.id as string)
          .select()
          .single();
        if (error) throw error;
        return data as Record<string, unknown>;
      }
      const { data, error } = await supabase
        .from(table as never)
        .insert(payload as never)
        .select()
        .single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success(initial?.id ? "Updated" : "Created");
      onSaved?.(row);
    },
    onError: (e: unknown) => {
      toast.error((e as Error).message ?? "Failed to save");
    },
  });

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v as Record<string, unknown>))}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const err = (form.formState.errors as Record<string, { message?: string }>)[f.key];
          return (
            <div
              key={f.key}
              className={f.colSpan === 2 ? "sm:col-span-2" : undefined}
            >
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                {f.label}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  rows={2}
                  placeholder={f.placeholder}
                  {...form.register(f.key)}
                />
              ) : f.type === "switch" ? (
                <div className="flex h-9 items-center">
                  <Switch
                    checked={!!form.watch(f.key)}
                    onCheckedChange={(v) => form.setValue(f.key, v as never)}
                  />
                </div>
              ) : f.type === "select" ? (
                <Select
                  value={(form.watch(f.key) as string) ?? ""}
                  onValueChange={(v) => form.setValue(f.key, v as never)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={f.placeholder ?? `Select ${f.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  step={f.type === "number" ? "any" : undefined}
                  placeholder={f.placeholder}
                  {...form.register(f.key, {
                    valueAsNumber: f.type === "number",
                  })}
                />
              )}
              {err?.message ? (
                <p className="mt-1 text-xs text-destructive">{err.message}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
