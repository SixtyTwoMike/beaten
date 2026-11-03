import { apiError, apiJson, apiRoute, readJson, requireApiUser } from "@/lib/api";
import { addCollectionItemForUser, collectionJson, type CollectionInput } from "@/lib/collection";

// The physical collection (docs/collection.md). Prices are in minor units
// (pence, cents; yen as is); the app may also send them as typed ("12.50").

// GET /api/v1/collection → {enabled, public, items}
export const GET = apiRoute("api collection", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return apiJson(await collectionJson(auth.userId));
});

// POST /api/v1/collection {igdbId, platformId, region?, completeness?, edition?,
// acquiredAt?, pricePaid?, currency?, notes?} → {item}; turns the collection on
export const POST = apiRoute("api collection add", async (request: Request) => {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (!body) return apiError("Invalid request");
  const result = await addCollectionItemForUser(auth.userId, body as unknown as CollectionInput);
  if (!result.ok) return apiError(result.error);
  return apiJson({ item: result.item }, 201);
});
