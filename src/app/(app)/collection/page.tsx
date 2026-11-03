import type { Metadata } from "next";
import { collectionFor, collectionSettings } from "@/lib/collection";
import { getPlatforms, platformOptions } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { Collection } from "@/components/Collection";
import { CollectionSettingsForm } from "@/components/CollectionSettingsForm";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage() {
  const user = await requireUser();
  const settings = await collectionSettings(user.id);
  if (!settings.enabled) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Collection</h1>
        <p className="mt-3 text-fog">
          Keep track of the physical games you own: platform, region, loose or boxed, what you paid. It&apos;s
          separate from your diary, and private unless you choose to show it on your profile.
        </p>
        <div className="mt-5">
          <CollectionSettingsForm {...settings} />
        </div>
      </div>
    );
  }
  const [entries, platforms] = await Promise.all([collectionFor(user.id), getPlatforms()]);
  return <Collection entries={entries} platforms={platformOptions(platforms)} />;
}
