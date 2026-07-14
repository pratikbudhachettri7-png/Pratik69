import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, Package, Wrench, Landmark } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/bills/")({
  component: BillsList,
});

const typeIcon: Record<string, React.ReactNode> = {
  items: <Package className="mr-1 h-3 w-3" />,
  services: <Wrench className="mr-1 h-3 w-3" />,
  fixed_assets: <Landmark className="mr-1 h-3 w-3" />,
};

function BillsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");

  const bills = useQuery({
    queryKey: ["bills", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("*, vendors(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const rows = useMemo(() => {
    let list = bills.data ?? [];
    if (status !== "all") list = list.filter((b) => b.status === status);
    if (type !== "all") list = list.filter((b) => b.bill_type === type);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter((b) =>
        [b.bill_number, b.internal_bill_number, b.po_number, (b.vendors as { name?: string })?.name]
          .some((v) => String(v ?? "").toLowerCase().includes(n)),
      );
    }
    return list;
  }, [bills.data, q, status, type]);

  return (
    <>
      <PageHeader
        title="Bills & Purchases"
        description="All bills from vendors — items, services, and fixed assets."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> New Bill
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/bills/new" search={{ type: "items" }}>
                  <Package className="mr-2 h-4 w-4" /> Items
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/bills/new" search={{ type: "services" }}>
                  <Wrench className="mr-2 h-4 w-4" /> Services
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/bills/new" search={{ type: "fixed_assets" }}>
                  <Landmark className="mr-2 h-4 w-4" /> Fixed Assets
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search bill #, PO, vendor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="items">Items</SelectItem>
              <SelectItem value="services">Services</SelectItem>
              <SelectItem value="fixed_assets">Fixed Assets</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No bills yet. Create your first bill.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((b) => (
                  <TableRow key={b.id as string} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/bills/$id"
                        params={{ id: b.id as string }}
                        className="font-medium text-primary hover:underline"
                      >
                        {(b.bill_number as string) || (b.internal_bill_number as string) || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{(b.vendors as { name?: string })?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {typeIcon[b.bill_type as string]}
                        {String(b.bill_type ?? "").replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{(b.invoice_date as string) || "—"}</TableCell>
                    <TableCell>
                      {b.status === "approved" ? (
                        <Badge className="bg-success text-success-foreground">Approved</Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {inr(Number(b.final_amount ?? 0))}
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
