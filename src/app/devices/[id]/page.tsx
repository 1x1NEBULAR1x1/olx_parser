import { notFound } from "next/navigation";
import { DeviceDetailPage } from "@/pages/device-detail";
import { loadDeviceDetail } from "@/server/domain/feed-loader";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initial = await loadDeviceDetail(Number(id));
  if (!initial) notFound();
  return <DeviceDetailPage initial={initial} />;
}
