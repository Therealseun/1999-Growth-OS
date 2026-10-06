import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["ADMIN"]}>
      <AppShell title="Employees" breadcrumbs={[{ label: "Employees" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
