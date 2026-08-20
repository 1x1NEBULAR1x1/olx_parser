import { prisma } from "@/shared/db/client";

export interface PushSubscriptionRecord {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
}

export async function upsertPushSubscription(input: {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
}): Promise<PushSubscriptionRecord> {
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: {
      user_id: input.user_id,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.user_agent,
    },
    create: {
      user_id: input.user_id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.user_agent,
    },
  });
  return {
    id: row.id,
    user_id: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    user_agent: row.user_agent,
  };
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function deleteUserPushSubscription(
  user_id: string,
  endpoint: string,
): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { user_id, endpoint } });
}

export async function listPushSubscriptionsForUser(
  user_id: string,
): Promise<PushSubscriptionRecord[]> {
  const rows = await prisma.pushSubscription.findMany({ where: { user_id } });
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    user_agent: row.user_agent,
  }));
}

export async function countUserPushSubscriptions(user_id: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { user_id } });
}
