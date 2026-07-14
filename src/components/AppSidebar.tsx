import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  Users,
  Truck,
  Package,
  Landmark,
  FileText,
  LayoutDashboard,
  Receipt,
  BookOpen,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const masters = [
  { title: "Companies", url: "/masters/companies", icon: Building2 },
  { title: "Customers", url: "/masters/customers", icon: Users },
  { title: "Vendors", url: "/masters/vendors", icon: Truck },
  { title: "Inventory", url: "/masters/items", icon: Package },
  { title: "Fixed Assets", url: "/masters/fixed-assets", icon: Landmark },
];

const bills = [
  { title: "All Bills", url: "/bills", icon: FileText },
  { title: "New Bill", url: "/bills/new", icon: Receipt },
  { title: "Vendor Ledger", url: "/ledgers", icon: BookOpen },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-sidebar-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">
            L
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Ledgerly</span>
            <span className="text-xs text-sidebar-foreground/60">Mini ERP</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link to="/">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Masters</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {masters.map((m) => (
                <SidebarMenuItem key={m.url}>
                  <SidebarMenuButton asChild isActive={isActive(m.url)}>
                    <Link to={m.url}>
                      <m.icon />
                      <span>{m.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Bills &amp; Purchase</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {bills.map((m) => (
                <SidebarMenuItem key={m.url}>
                  <SidebarMenuButton asChild isActive={isActive(m.url)}>
                    <Link to={m.url}>
                      <m.icon />
                      <span>{m.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
