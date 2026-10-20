export default function Loading() {
  return (
    <main
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-label="Loading page"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-luxe-border)] border-t-[var(--color-luxe-accent)]" />
    </main>
  );
}
