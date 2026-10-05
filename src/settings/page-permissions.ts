import { normalizePageOrigin } from "./settings";

export interface PagePermissionApi {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  getAll(): Promise<{ origins?: string[] }>;
  remove(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

export async function requestPageOrigin(
  permissions: PagePermissionApi,
  pageUrl: string,
): Promise<string | null> {
  const origin = normalizePageOrigin(pageUrl);
  if (origin === null) {
    return null;
  }
  return (await permissions.request({ origins: [origin] })) ? origin : null;
}

export async function removePageOrigin(
  permissions: PagePermissionApi,
  origin: string,
): Promise<boolean> {
  const normalized = normalizePageOrigin(origin);
  return (
    normalized !== null && (await permissions.remove({ origins: [normalized] }))
  );
}

export async function listGrantedPageOrigins(
  permissions: PagePermissionApi,
): Promise<string[]> {
  const origins = (await permissions.getAll()).origins ?? [];
  return origins
    .map(normalizePageOrigin)
    .filter((origin): origin is string => origin !== null)
    .sort();
}

export async function filterGrantedPageOrigins(
  permissions: PagePermissionApi,
  origins: string[],
): Promise<string[]> {
  const granted: string[] = [];
  for (const origin of origins) {
    const normalized = normalizePageOrigin(origin);
    if (
      normalized !== null &&
      (await permissions.contains({ origins: [normalized] }))
    ) {
      granted.push(normalized);
    }
  }
  return [...new Set(granted)].sort();
}
