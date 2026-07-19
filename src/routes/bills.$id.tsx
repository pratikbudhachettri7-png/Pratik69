import { createFileRoute, notFound, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BillForm } from "@/components/bills/BillForm";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/bills/$id")({
  component: BillDetail,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-muted-foreground">Bill not found.</div>
  ),
});

function BillDetail() {
  const { id } = Route.useParams();
  const location = useLocation();

  // Read OCR result from TanStack Router navigation state (passed via navigate({ state }))
  const pendingOcr = (location.state as unknown as Record<string, unknown> | null)?.ocrResult as Record<string, unknown> | null ?? null;

  const q = useQuery({
    queryKey: ["bills", id],
    queryFn: async () => {
      const [bill, lines] = await Promise.all([
        supabase.from("bills").select("*").eq("id", id).maybeSingle(),
        supabase.from("bill_lines").select("*").eq("bill_id", id).order("sno"),
      ]);
      if (bill.error) throw bill.error;
      if (!bill.data) throw notFound();
      if (lines.error) throw lines.error;

      return {
        bill: bill.data as Record<string, unknown>,
        lines: (lines.data ?? []) as Array<Record<string, unknown>>,
      };
    },
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading bill…
      </div>
    );
  }
  if (!q.data) return null;

  return (
    <BillForm
      billId={id}
      initial={q.data}
      pendingOcrResult={pendingOcr}
    />
  );
}
