import { ProtectedRoute } from "@/lib/protected-route";

export default function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Protection only — each campaigns page renders its own AppShell with its own
  // title/breadcrumbs (the list and detail pages differ).
  return <ProtectedRoute requiredRoles={["ADMIN", "MANAGER"]}>{children}</ProtectedRoute>;
}
