import type { APIRoute } from "astro";
import { serveCollectionFeed } from "../../../lib/collectionFeedRoute";

export const GET: APIRoute = (context) =>
  serveCollectionFeed(context, {
    locale: context.params.locale,
    collection: context.params.collection ?? "",
  });
