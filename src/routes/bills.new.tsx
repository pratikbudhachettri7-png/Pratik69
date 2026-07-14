import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BillForm } from "@/components/bills/BillForm";

const searchSchema = z.object({
  type: z.enum(["items", "services", "fixed_assets"]).catch("items"),
});

export const Route = createFileRoute("/bills/new")({
  validateSearch: searchSchema,
  component: NewBill,
});

function NewBill() {
  const { type } = Route.useSearch();
  return <BillForm initialType={type} />;
}
