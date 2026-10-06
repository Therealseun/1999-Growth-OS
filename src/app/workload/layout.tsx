import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function WorkloadLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["ADMIN"]}>
      <AppShell title="Workload Settings" breadcrumbs={[{ label: "Workload Settings" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
