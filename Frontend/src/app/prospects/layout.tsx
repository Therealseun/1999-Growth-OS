import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function ProspectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>
      <AppShell title="Prospects" breadcrumbs={[{ label: "Prospects" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
