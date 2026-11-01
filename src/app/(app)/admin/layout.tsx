import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";

export const metadata = { title: "Admin — Beaten", robots: { index: false } };

// Everything under /admin is for ADMIN_EMAILS only (404 for anyone else).
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPage();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-edge pb-3 text-sm">
        <Link href="/admin" className="font-semibold text-white">Admin</Link>
        <Link href="/admin/achievements" className="text-fog hover:text-white">Beaten achievements</Link>
      </div>
      {children}
    </div>
  );
}
