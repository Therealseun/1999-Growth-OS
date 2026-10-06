import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/lib/protected-route";

export default function SeoLayou({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={["EMPLOYEE"]}>
      <AppShell title="SEO" breadcrumbs={[{ label: "SEO" }]}>
        {children}
      </AppShell>
    </ProtectedRoute>
  );
}
