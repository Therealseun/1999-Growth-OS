import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["EMPLOYEE"]}>
      <AppShell title="Email" breadcrumbs={[{ label: "Email" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
