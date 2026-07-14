import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { z } from "zod";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MasterForm, type FieldDef } from "./MasterForm";

interface Props {
  title: string;
  description: string;
  table: string;
  schema: z.ZodTypeAny;
  fields: FieldDef[];
  columns: Array<{ key: string; label: string; render?: (v: unknown) => string }>;
  searchKeys: string[];
}

export function MasterCrudPage({
  title,
  description,
  table,
  schema,
  fields,
  columns,
  searchKeys,
}: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [table, "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: [table] });
      setConfirmDelete(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = useMemo(() => {
    const list = query.data ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((r) =>
      searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)),
    );
  }, [query.data, q, searchKeys]);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="mr-1 h-4 w-4" /> New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? `Edit ${title.replace(/s$/, "")}` : `New ${title.replace(/s$/, "")}`}</DialogTitle>
              </DialogHeader>
              <MasterForm
                table={table}
                schema={schema}
                fields={fields}
                initial={editing}
                onSaved={() => {
                  setOpen(false);
                  setEditing(null);
                }}
                onCancel={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />
      <div className="space-y-4 p-6">
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="py-8 text-center text-muted-foreground">
                    No records. Click <b>New</b> to add one.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id as string}>
                    {columns.map((c) => (
                      <TableCell key={c.key}>
                        {c.render ? c.render(r[c.key]) : String(r[c.key] ?? "—")}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmDelete(r.id as string)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && del.mutate(confirmDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
