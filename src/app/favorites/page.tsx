import { FavoritesPage } from "@/pages/favorites";
import { loadFavoritesFeed } from "@/server/domain/feed-loader";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial_feed = await loadFavoritesFeed();
  return <FavoritesPage initial_feed={initial_feed} />;
}
