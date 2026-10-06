import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function TeamTasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["MANAGER"]}>
      <AppShell title="Team Tasks" breadcrumbs={[{ label: "Team Tasks" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
