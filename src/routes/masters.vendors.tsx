import { createFileRoute } from "@tanstack/react-router";
import { MasterCrudPage } from "@/components/masters/MasterCrudPage";
import { vendorSchema, vendorFields } from "@/components/masters/schemas";

export const Route = createFileRoute("/masters/vendors")({
  component: () => (
    <MasterCrudPage
      title="Vendors"
      description="Suppliers you receive bills from."
      table="vendors"
      schema={vendorSchema}
      fields={vendorFields}
      searchKeys={["name", "vat_number", "pan", "contact_person", "email"]}
      columns={[
        { key: "name", label: "Name" },
        { key: "vat_number", label: "VAT Number" },
        { key: "pan", label: "PAN" },
        { key: "contact_person", label: "Contact" },
        { key: "state", label: "State" },
        { key: "payment_terms", label: "Terms" },
      ]}
    />
  ),
});
