import { useState, useEffect } from 'react';

export const OWNER_ACCOUNT = {
  name: 'Owner',
  username: 'VNJAVA',
  password: '112007',
  role: 'owner',
  isVerified: true,
  isOwner: true,
  badge: 'blue-check'
};

export interface RegisteredUser {
  id?: string;
  username: string;
  name: string;
  password?: string;
  role?: 'owner' | 'admin' | 'vip' | 'user';
  isOwner?: boolean;
  isVerified?: boolean;
  photo?: string;
  avatar?: string;
  bio?: string;
}

export function getAllUsers(): RegisteredUser[] {
  return [
    {
      id: 'ZE-OWNER',
      username: 'VNJAVA',
      name: 'Owner',
      password: '112007',
      role: 'owner',
      isOwner: true,
      isVerified: true,
      photo: '/assets/vnjava_logo.jpg',
      avatar: '/assets/vnjava_logo.jpg',
      bio: 'Official Owner & Creator of VNJAVA'
    }
  ];
}

export function checkDuplicateUser(
  newName: string,
  newUsername?: string,
  currentUserId?: string,
  passwordAttempt?: string
): { isDuplicate: boolean; reason?: string } {
  const lowerName = newName.trim().toLowerCase();
  const lowerUser = (newUsername || '').trim().toLowerCase().replace(/^@/, '');
  const upperUid = String(currentUserId || '').trim().toUpperCase();

  if (lowerUser === 'vnjava' || lowerUser === 'ze.io' || lowerName === 'zvn3') {
    if (
      passwordAttempt !== '112007' &&
      upperUid !== 'ZE-OWNER' &&
      upperUid !== 'VNJAVA'
    ) {
      return { isDuplicate: true, reason: 'Username ini khusus milik Owner VNJAVA' };
    }
  }

  return { isDuplicate: false };
}

export function saveUserToDatabase(newUser: RegisteredUser) {
  fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newUser),
  }).catch(() => {});
}

export interface UserStoreData {
  name: string;
  username: string;
  id: string;
  avatar: string | null;
  photo?: string | null;
  bio: string;
  role: 'owner' | 'admin' | 'vip' | 'user' | string;
  isOwner: boolean;
  isAdmin?: boolean;
  isVip?: boolean;
  vip?: boolean;
  vipLevel?: 'basic' | 'exclusive';
  isVipExclusive?: boolean;
  vipExpiresAt?: number;
  adminPermissions?: string[];
  isVerified: boolean;
  blueTick?: boolean;
  followers?: number | string;
}

function getSavedAccountProfile(uid: string): any {
  const cleanUid = String(uid || '').trim().toUpperCase();
  if (!cleanUid) return null;
  try {
    const raw = localStorage.getItem(`ze_profile_${cleanUid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredUser(): UserStoreData {
  let savedSession: any = null;
  try {
    const raw =
      localStorage.getItem('zeio-user') ||
      localStorage.getItem('ze_user') ||
      localStorage.getItem('vn_currentUser');
    if (raw) savedSession = JSON.parse(raw);
  } catch {}

  const rawUsername = String(
    savedSession?.username || localStorage.getItem('ze_username') || ''
  ).trim();
  const cleanLowerUname = rawUsername.toLowerCase().replace(/^@/, '');

  const isOwner =
    cleanLowerUname === 'vnjava' ||
    cleanLowerUname === 'ze.io' ||
    String(savedSession?.id || '').toUpperCase() === 'ZE-OWNER' ||
    localStorage.getItem('ze_isOwner') === 'true' ||
    savedSession?.isOwner === true ||
    savedSession?.role === 'owner';

  const id = isOwner
    ? 'ZE-OWNER'
    : String(savedSession?.id || localStorage.getItem('ze_id') || '');
  const cleanIdUpper = String(id || '').trim().toUpperCase();
  const savedProfile = getSavedAccountProfile(cleanIdUpper);

  const isAdmin =
    !isOwner && Boolean(savedSession?.role === 'admin' || savedSession?.isAdmin === true);
  const rawVip = Boolean(
    savedSession?.isVip ||
      savedSession?.vip ||
      savedSession?.vipLevel === 'basic' ||
      savedSession?.vipLevel === 'exclusive' ||
      savedSession?.isVipExclusive === true
  );
  const vipExpiresAt = Number(savedSession?.vipExpiresAt || 0);
  const isVip = isOwner || (rawVip && (!vipExpiresAt || vipExpiresAt > Date.now()));
  const resolvedVipLevel: 'basic' | 'exclusive' | undefined = isOwner
    ? 'exclusive'
    : isVip
    ? String(savedSession?.vipLevel || '').toLowerCase() === 'exclusive' ||
      savedSession?.isVipExclusive === true
      ? 'exclusive'
      : 'basic'
    : undefined;
  const isVipExclusive = Boolean(isOwner || (isVip && resolvedVipLevel === 'exclusive'));

  // Never hardcode Owner name/username to 'zvn3'/'ZE.io': preserve saved edits
  const username =
    savedSession?.username ||
    savedProfile?.username ||
    localStorage.getItem('ze_username') ||
    (isOwner ? 'VNJAVA' : '');
  const name =
    savedSession?.name ||
    savedProfile?.name ||
    localStorage.getItem('ze_name') ||
    (isOwner ? 'Owner' : username || 'User');

  const perUidCachedAvatar = cleanIdUpper
    ? localStorage.getItem(`ze_avatar_${cleanIdUpper}`)
    : null;
  const avatar =
    savedSession?.photo ||
    savedSession?.avatar ||
    savedProfile?.photo ||
    perUidCachedAvatar ||
    (isOwner ? '/assets/vnjava_logo.jpg' : null);

  const bio =
    savedSession?.bio ||
    savedProfile?.bio ||
    localStorage.getItem('ze_about') ||
    (isOwner ? 'Official Owner of VNJAVA' : 'Hey there! I am using VNJAVA.');

  return {
    name,
    username,
    id,
    avatar,
    photo: avatar,
    bio,
    role: isOwner ? 'owner' : isAdmin ? 'admin' : savedSession?.role || 'user',
    isOwner,
    isAdmin,
    isVip,
    vip: isVip,
    vipLevel: resolvedVipLevel,
    isVipExclusive,
    vipExpiresAt,
    adminPermissions: savedSession?.adminPermissions || [],
    isVerified: Boolean(isOwner || savedSession?.isVerified),
  };
}

export function clearUserStore() {
  localStorage.removeItem('ze_user');
  localStorage.removeItem('zeio-user');
  localStorage.removeItem('vn_currentUser');
  localStorage.removeItem('vn_session');
  localStorage.removeItem('ze_avatar');
  localStorage.removeItem('ze_photo');
  localStorage.removeItem('ze_name');
  localStorage.removeItem('ze_username');
  localStorage.removeItem('ze_id');
  localStorage.removeItem('ze_about');
  localStorage.removeItem('ze_isOwner');
  localStorage.removeItem('ze_owner_token');
  window.dispatchEvent(new Event('ze-user-store-updated'));
  window.dispatchEvent(new Event('zeio-user-updated'));
}

const USER_UPDATE_EVENT = 'ze-user-store-updated';

export function useUserStore() {
  const [user, setUserState] = useState<UserStoreData>(getStoredUser);

  useEffect(() => {
    let active = true;
    const handleUpdate = () => {
      queueMicrotask(() => {
        if (!active) return;
        const next = getStoredUser();
        setUserState((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next
        );
      });
    };

    window.addEventListener(USER_UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('zeio-user-updated', handleUpdate);

    return () => {
      active = false;
      window.removeEventListener(USER_UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('zeio-user-updated', handleUpdate);
    };
  }, []);

  const setUser = (newData: Partial<UserStoreData>) => {
    const current = getStoredUser();
    const checkUname = newData.username !== undefined ? newData.username : current.username;
    const cleanLower = String(checkUname || '').toLowerCase().replace(/^@/, '');
    const isOwner =
      Boolean(newData.isOwner) ||
      current.isOwner ||
      cleanLower === 'vnjava' ||
      cleanLower === 'ze.io' ||
      String(newData.id || current.id).toUpperCase() === 'ZE-OWNER';
    const nextRole = isOwner ? 'owner' : newData.role !== undefined ? newData.role : current.role;
    const nextIsAdmin = isOwner
      ? true
      : newData.isAdmin !== undefined
      ? newData.isAdmin
      : Boolean(current.isAdmin || nextRole === 'admin');
    const nextIsVip = isOwner
      ? true
      : newData.isVip !== undefined
      ? Boolean(newData.isVip)
      : newData.vip !== undefined
      ? Boolean(newData.vip)
      : Boolean(current.isVip || current.vip);
    const nextVipLevel: 'basic' | 'exclusive' | undefined = isOwner
      ? 'exclusive'
      : nextIsVip
      ? newData.vipLevel !== undefined
        ? newData.vipLevel
        : newData.isVipExclusive === true
        ? 'exclusive'
        : current.vipLevel || 'basic'
      : undefined;
    const nextIsVipExclusive = Boolean(isOwner || (nextIsVip && nextVipLevel === 'exclusive'));

    const resolvedPhoto =
      newData.avatar !== undefined
        ? newData.avatar
        : newData.photo !== undefined
        ? newData.photo
        : current.avatar;

    const updated: UserStoreData = {
      ...current,
      ...newData,
      id: isOwner ? 'ZE-OWNER' : newData.id || current.id,
      role: nextRole,
      isOwner,
      isAdmin: nextIsAdmin,
      isVip: nextIsVip,
      vip: nextIsVip,
      vipLevel: nextVipLevel,
      isVipExclusive: nextIsVipExclusive,
      isVerified: Boolean(isOwner || newData.isVerified || current.isVerified),
      photo: resolvedPhoto,
      avatar: resolvedPhoto,
    };

    if (updated.name) localStorage.setItem('ze_name', updated.name);
    if (updated.username !== undefined) localStorage.setItem('ze_username', updated.username);
    if (updated.id) localStorage.setItem('ze_id', updated.id);
    if (updated.bio !== undefined) localStorage.setItem('ze_about', updated.bio);
    localStorage.setItem('ze_isOwner', String(isOwner));

    const cleanUpdatedId = String(updated.id || '').trim().toUpperCase();
    localStorage.removeItem('ze_avatar');
    localStorage.removeItem('ze_photo');
    if (cleanUpdatedId && updated.avatar) {
      try {
        localStorage.setItem(`ze_avatar_${cleanUpdatedId}`, updated.avatar);
      } catch {}
    } else if (cleanUpdatedId && newData.avatar === null) {
      localStorage.removeItem(`ze_avatar_${cleanUpdatedId}`);
    }

    if (cleanUpdatedId) {
      try {
        localStorage.setItem(
          `ze_profile_${cleanUpdatedId}`,
          JSON.stringify({
            id: updated.id,
            name: updated.name,
            username: updated.username,
            bio: updated.bio,
            photo: updated.photo,
          })
        );
      } catch {}
    }

    try {
      localStorage.setItem('ze_user', JSON.stringify(updated));
      localStorage.setItem('zeio-user', JSON.stringify(updated));
      localStorage.setItem('vn_currentUser', JSON.stringify(updated));
    } catch {}

    setUserState(updated);
    window.dispatchEvent(new Event(USER_UPDATE_EVENT));
    window.dispatchEvent(new Event('zeio-user-updated'));
  };

  return { user, setUser, isOwner: user.isOwner };
}

export function getUserAvatarUrl(user: {
  name?: string;
  avatar?: string | null;
  photo?: string | null;
}): string {
  if (user.avatar) return user.avatar;
  if (user.photo) return user.photo;
  const seedName = user.name || 'VNJAVA';
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seedName)}`;
}
