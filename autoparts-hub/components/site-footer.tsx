export function SiteFooter() {
  return (
    <footer className="border-t border-ink-line mt-16">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row justify-between gap-4 text-xs text-mute">
        <p>© {new Date().getFullYear()} AutoParts Hub. Prices shown are resolved per your account&apos;s pricing tier.</p>
        <p className="font-mono">Catalog data synced hourly · TecDoc-compatible</p>
      </div>
    </footer>
  );
}
