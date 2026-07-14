import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export const listQueryOptions = <T extends string>(table: T) =>
  queryOptions({
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

export const billsListOptions = queryOptions({
  queryKey: ["bills", "list"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("bills")
      .select("*, vendors(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const billByIdOptions = (id: string) =>
  queryOptions({
    queryKey: ["bills", id],
    queryFn: async () => {
      const [{ data: bill, error: e1 }, { data: lines, error: e2 }] = await Promise.all([
        supabase.from("bills").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("bill_lines")
          .select("*")
          .eq("bill_id", id)
          .order("sno", { ascending: true }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { bill, lines: lines ?? [] };
    },
  });
