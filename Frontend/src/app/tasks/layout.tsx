import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["ADMIN"]}>
      <AppShell title="Tasks" breadcrumbs={[{ label: "Tasks" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
