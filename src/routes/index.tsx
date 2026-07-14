import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Building2, Users, Truck, Package, Landmark, FileText, Plus } from "lucide-react";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const useCount = (table: string) =>
  useQuery({
    queryKey: [table, "count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table as never)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

function Dashboard() {
  const companies = useCount("companies");
  const customers = useCount("customers");
  const vendors = useCount("vendors");
  const items = useCount("items");
  const assets = useCount("fixed_assets");
  const bills = useCount("bills");

  const recent = useQuery({
    queryKey: ["bills", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, invoice_date, final_amount, status, bill_type, vendors(name)")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cards = [
    { label: "Companies", count: companies.data, icon: Building2, to: "/masters/companies" },
    { label: "Customers", count: customers.data, icon: Users, to: "/masters/customers" },
    { label: "Vendors", count: vendors.data, icon: Truck, to: "/masters/vendors" },
    { label: "Items", count: items.data, icon: Package, to: "/masters/items" },
    { label: "Fixed Assets", count: assets.data, icon: Landmark, to: "/masters/fixed-assets" },
    { label: "Bills", count: bills.data, icon: FileText, to: "/bills" },
  ] as const;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your masters and bill activity."
        actions={
          <Button asChild>
            <Link to="/bills/new">
              <Plus className="mr-1 h-4 w-4" /> New Bill
            </Link>
          </Button>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => (
            <Link key={c.label} to={c.to}>
              <Card className="transition-colors hover:border-primary/40">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {c.label}
                  </CardTitle>
                  <c.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{c.count ?? "—"}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent bills</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.data && recent.data.length > 0 ? (
              <div className="divide-y divide-border">
                {recent.data.map((b) => (
                  <Link
                    key={b.id}
                    to="/bills/$id"
                    params={{ id: b.id as string }}
                    className="flex items-center justify-between py-2 text-sm hover:text-primary"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {b.bill_number || "(no bill #)"} ·{" "}
                        <span className="text-muted-foreground">
                          {(b.vendors as { name?: string } | null)?.name || "—"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {b.bill_type} · {b.invoice_date || ""} · {b.status}
                      </span>
                    </div>
                    <span className="font-semibold">{inr(Number(b.final_amount))}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No bills yet.{" "}
                <Link to="/bills/new" className="text-primary underline">
                  Create your first bill
                </Link>
                .
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
