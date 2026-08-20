import { HomePage } from "@/pages/home";
import { loadHomeFeedFromSearchParams } from "@/server/domain/feed-loader";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initial_feed = await loadHomeFeedFromSearchParams(params);
  return <HomePage initial_feed={initial_feed} />;
}
