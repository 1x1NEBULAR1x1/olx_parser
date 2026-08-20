import { prisma } from "@/shared/db/client";

export interface UserListingIds {
  favorite_ids: number[];
  hidden_ids: number[];
}

export async function getUserListingIds(user_id: string): Promise<UserListingIds> {
  const [favorites, hidden] = await Promise.all([
    prisma.favoriteDevice.findMany({
      where: { user_id },
      select: { device_id: true },
    }),
    prisma.hiddenDevice.findMany({
      where: { user_id },
      select: { device_id: true },
    }),
  ]);

  return {
    favorite_ids: favorites.map((row) => row.device_id),
    hidden_ids: hidden.map((row) => row.device_id),
  };
}

export async function addFavorite(user_id: string, device_id: number): Promise<void> {
  await prisma.favoriteDevice.upsert({
    where: { user_id_device_id: { user_id, device_id } },
    create: { user_id, device_id },
    update: {},
  });
}

export async function removeFavorite(user_id: string, device_id: number): Promise<void> {
  await prisma.favoriteDevice.deleteMany({
    where: { user_id, device_id },
  });
}

export async function hideDevice(user_id: string, device_id: number): Promise<void> {
  await prisma.hiddenDevice.upsert({
    where: { user_id_device_id: { user_id, device_id } },
    create: { user_id, device_id },
    update: {},
  });
}

export async function unhideDevice(user_id: string, device_id: number): Promise<void> {
  await prisma.hiddenDevice.deleteMany({
    where: { user_id, device_id },
  });
}

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  is_approved: boolean;
  created_at: string;
  favorites_count: number;
  hidden_count: number;
}

export async function listApprovedUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { is_approved: true },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { favorites: true, hidden_devices: true },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    is_approved: user.is_approved,
    created_at: user.createdAt.toISOString(),
    favorites_count: user._count.favorites,
    hidden_count: user._count.hidden_devices,
  }));
}

export async function updateUserAccess(
  user_id: string,
  patch: { is_approved?: boolean; role?: string },
): Promise<AdminUserRow | null> {
  const user = await prisma.user.update({
    where: { id: user_id },
    data: {
      ...(patch.is_approved !== undefined ? { is_approved: patch.is_approved } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
    },
    include: {
      _count: {
        select: { favorites: true, hidden_devices: true },
      },
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    is_approved: user.is_approved,
    created_at: user.createdAt.toISOString(),
    favorites_count: user._count.favorites,
    hidden_count: user._count.hidden_devices,
  };
}
