import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/ledgers")({
  component: LedgersPage,
});

function LedgersPage() {
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const vendors = useQuery({
    queryKey: ["vendors", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ledgers = useQuery({
    queryKey: ["ledgers", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledgers")
        .select("*, vendors(name), bills(bill_number, internal_bill_number)")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const rows = useMemo(() => {
    let list = ledgers.data ?? [];
    if (vendorFilter !== "all") {
      list = list.filter((l) => l.vendor_id === vendorFilter);
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((l) =>
        [l.description, (l.vendors as { name?: string })?.name]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(needle)),
      );
    }
    return list;
  }, [ledgers.data, vendorFilter, q]);

  // Compute running balance (for filtered view)
  const rowsWithBalance = useMemo<Array<Record<string, any>>>(() => {
    // Reverse to compute chronologically, then reverse back
    const chronological = [...rows].reverse();
    let balance = 0;
    const result = chronological.map((r) => {
      balance += Number(r.debit ?? 0) - Number(r.credit ?? 0);
      return { ...r, balance };
    });
    return result.reverse();
  }, [rows]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit ?? 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Vendor Ledger"
        description="Transaction ledger for all vendors — debits, credits, and running balance."
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {(vendors.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search description…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Badge variant="outline" className="px-3 py-1">
              Total Debit: {inr(totalDebit)}
            </Badge>
            <Badge variant="outline" className="px-3 py-1">
              Total Credit: {inr(totalCredit)}
            </Badge>
            <Badge
              variant={totalDebit - totalCredit >= 0 ? "default" : "destructive"}
              className="px-3 py-1"
            >
              Net: {inr(totalDebit - totalCredit)}
            </Badge>
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-36 text-right">Debit</TableHead>
                <TableHead className="w-36 text-right">Credit</TableHead>
                <TableHead className="w-36 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgers.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rowsWithBalance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No ledger entries yet. Approve a bill to create one automatically.
                  </TableCell>
                </TableRow>
              ) : (
                rowsWithBalance.map((r) => (
                  <TableRow key={r.id as string}>
                    <TableCell className="text-muted-foreground">
                      {r.date as string}
                    </TableCell>
                    <TableCell className="font-medium">
                      {(r.vendors as { name?: string })?.name ?? "—"}
                    </TableCell>
                    <TableCell>{(r.description as string) || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.debit) > 0 ? inr(Number(r.debit)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.credit) > 0 ? inr(Number(r.credit)) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        (r.balance as number) < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {inr(r.balance as number)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
