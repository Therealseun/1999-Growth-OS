import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function MyPerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["EMPLOYEE"]}>
      <AppShell title="My Performance" breadcrumbs={[{ label: "My Performance" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
