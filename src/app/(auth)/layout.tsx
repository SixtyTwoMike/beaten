export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="text-3xl font-black tracking-tight">
          BEAT<span className="text-mint">EN</span>
        </p>
        <p className="mt-1 text-sm text-fog">
          Track the games you&apos;ve conquered.
        </p>
      </div>
      {children}
    </main>
  );
}
