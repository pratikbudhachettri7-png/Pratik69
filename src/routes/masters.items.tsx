import { createFileRoute } from "@tanstack/react-router";
import { MasterCrudPage } from "@/components/masters/MasterCrudPage";
import { itemSchema, itemFields } from "@/components/masters/schemas";

export const Route = createFileRoute("/masters/items")({
  component: () => (
    <MasterCrudPage
      title="Inventory Items"
      description="Goods and services you buy or sell. Toggle 'is service' for service SKUs."
      table="items"
      schema={itemSchema}
      fields={itemFields}
      searchKeys={["item_code", "item_name", "hsn_code"]}
      columns={[
        { key: "item_code", label: "Code" },
        { key: "item_name", label: "Name" },
        { key: "uom", label: "Unit" },
        { key: "qty", label: "Qty" },
        { key: "default_rate", label: "Purchase Price" },
        { key: "selling_price", label: "Selling Price" },
        { key: "reorder_level", label: "Reorder Level" },
        { key: "warehouse", label: "Warehouse" },
        { key: "status", label: "Status" },
      ]}
    />
  ),
});
