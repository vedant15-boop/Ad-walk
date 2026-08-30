import { Directory, File, Paths } from "expo-file-system";

// Persistent, app-private cache for ad media (images + video), so playback
// survives a stretch offline. Paths.document (not Paths.cache) — the cache
// directory can be reclaimed by the OS under storage pressure, which would
// defeat the entire point right when it matters most.
const CACHE_DIR = new Directory(Paths.document, "ad-media");

function ensureDir() {
  if (!CACHE_DIR.exists) {
    CACHE_DIR.create({ idempotent: true });
  }
}

// Deterministic, filesystem-safe filename derived from the remote URL, so
// the same ad always maps to the same local file and a changed URL (e.g.
// re-uploaded creative) naturally misses the cache and re-downloads.
function cacheFileFor(remoteUri: string): File {
  const clean = remoteUri.split("?")[0].split("#")[0];
  const ext = clean.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  let hash = 0;
  for (let i = 0; i < remoteUri.length; i++) {
    hash = (hash * 31 + remoteUri.charCodeAt(i)) | 0;
  }
  return new File(CACHE_DIR, `${Math.abs(hash).toString(36)}${ext}`);
}

/** Synchronous cache-hit check. Returns a local file:// URI, or null. */
export function getCachedUri(remoteUri: string): string | null {
  try {
    const file = cacheFileFor(remoteUri);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Idempotent background download. Best-effort — playback always falls
 * back to the live remote URL if this fails, so failures are swallowed. */
export async function ensureCached(remoteUri: string): Promise<void> {
  try {
    ensureDir();
    const file = cacheFileFor(remoteUri);
    if (file.exists) return;
    await File.downloadFileAsync(remoteUri, file, { idempotent: true });
  } catch {
    // offline, or the request failed — try again next refresh cycle
  }
}

/** Caches a batch of URLs with a small concurrency cap instead of firing
 * every download at once. */
export async function prefetchAll(remoteUris: string[], concurrency = 3): Promise<void> {
  const queue = [...new Set(remoteUris.filter(Boolean))];
  async function worker() {
    let uri: string | undefined;
    while ((uri = queue.shift())) {
      await ensureCached(uri);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/** Deletes any cached file that isn't in the given list of still-relevant
 * URLs, so media dropped from rotation doesn't accumulate on disk forever. */
export function pruneCacheExcept(remoteUris: string[]): void {
  try {
    if (!CACHE_DIR.exists) return;
    const keep = new Set(remoteUris.filter(Boolean).map((u) => cacheFileFor(u).name));
    for (const entry of CACHE_DIR.list()) {
      if (entry instanceof File && !keep.has(entry.name)) {
        try {
          entry.delete();
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}
