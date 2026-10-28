import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <Logo href="/" className="text-3xl" />
          <p className="mt-1 text-sm text-fog">
            Track the games you&apos;ve conquered.
          </p>
        </div>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
