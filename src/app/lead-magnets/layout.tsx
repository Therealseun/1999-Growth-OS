import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function LeadMagnetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["EMPLOYEE"]}>
      <AppShell title="Lead Magnets" breadcrumbs={[{ label: "Lead Magnets" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
