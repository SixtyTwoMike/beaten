import Link from "next/link";
import { resolveAvatar, type AvatarFields } from "@/lib/avatar";
import { Avatar } from "./Avatar";

export type Person = AvatarFields & {
  username: string | null;
  name: string | null;
  image: string | null;
};

// A list of people, linking to their profiles.
export function PeopleList({ people, empty }: { people: Person[]; empty: string }) {
  const shown = people.filter((p) => p.username);
  if (shown.length === 0) return <p className="text-sm text-fog">{empty}</p>;
  return (
    <ul className="divide-y divide-edge rounded-xl border border-edge bg-card">
      {shown.map((p) => (
        <li key={p.username}>
          <Link href={`/${p.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-card-2">
            <Avatar avatar={resolveAvatar(p)} image={p.image} name={p.name || p.username!} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{p.name || `@${p.username}`}</p>
              <p className="truncate text-sm text-fog">@{p.username}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
