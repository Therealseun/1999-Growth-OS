import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>
      <AppShell title="Reports" breadcrumbs={[{ label: "Reports" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
