import { createFileRoute } from "@tanstack/react-router";
import { MasterCrudPage } from "@/components/masters/MasterCrudPage";
import { companySchema, companyFields } from "@/components/masters/schemas";

export const Route = createFileRoute("/masters/companies")({
  component: () => (
    <MasterCrudPage
      title="Companies"
      description="Your legal entities. VAT Number and state drive tax calculations on bills."
      table="companies"
      schema={companySchema}
      fields={companyFields}
      searchKeys={["name", "vat_number", "city", "state"]}
      columns={[
        { key: "name", label: "Name" },
        { key: "vat_number", label: "VAT Number" },
        { key: "state", label: "State" },
        { key: "phone", label: "Phone" },
        { key: "email", label: "Email" },
      ]}
    />
  ),
});
