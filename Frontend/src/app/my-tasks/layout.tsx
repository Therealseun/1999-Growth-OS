import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function MyTasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["EMPLOYEE"]}>
      <AppShell title="My Tasks" breadcrumbs={[{ label: "My Tasks" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
