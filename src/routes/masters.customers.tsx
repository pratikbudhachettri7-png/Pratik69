import { createFileRoute } from "@tanstack/react-router";
import { MasterCrudPage } from "@/components/masters/MasterCrudPage";
import { customerSchema, customerFields } from "@/components/masters/schemas";

export const Route = createFileRoute("/masters/customers")({
  component: () => (
    <MasterCrudPage
      title="Customers"
      description="People and businesses you sell to."
      table="customers"
      schema={customerSchema}
      fields={customerFields}
      searchKeys={["name", "vat_number", "contact_person", "email"]}
      columns={[
        { key: "name", label: "Name" },
        { key: "vat_number", label: "VAT Number" },
        { key: "contact_person", label: "Contact" },
        { key: "state", label: "State" },
        { key: "phone", label: "Phone" },
      ]}
    />
  ),
});
