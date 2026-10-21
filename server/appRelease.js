/* Latest Android release, read from GitHub and cached. The APK asset must be named
   ruminate-v<versionName>-c<versionCode>.apk with a matching .sha256 asset; releases
   published under any other name are ignored. */
export const ASSET_PATTERN = /^ruminate-v(.+)-c(\d+)\.apk$/;

export function parseRelease(release, shaText) {
  const asset = (release?.assets || []).find(item => ASSET_PATTERN.test(item.name));
  if (!asset) return null;
  const [, version, code] = asset.name.match(ASSET_PATTERN);
  return {
    version,
    versionCode: Number(code),
    size: Number.isFinite(asset.size) ? asset.size : null,
    publishedAt: release.published_at || "",
    notes: release.body || "",
    sha256: shaText?.trim().split(/\s+/)[0]?.toLowerCase() || null,
    downloadUrl: asset.browser_download_url
  };
}

export function toLatestResponse(latest, configured) {
  return {
    configured,
    version: latest?.version ?? null,
    version_code: latest?.versionCode ?? null,
    size: latest?.size ?? null,
    published_at: latest?.publishedAt ?? "",
    notes: latest?.notes ?? "",
    sha256: latest?.sha256 ?? null
  };
}

const RETRY_AFTER_FAILURE_MS = 60 * 1000;

export function createReleaseCache({ fetchJson, fetchText, now = Date.now, ttlMs }) {
  let latest = null, expiresAt = 0, inFlight = null;
  async function refresh() {
    try {
      const release = await fetchJson();
      const shaAsset = (release?.assets || []).find(item => item.name.endsWith(".apk.sha256") && ASSET_PATTERN.test(item.name.slice(0, -7)));
      const shaText = shaAsset ? await fetchText(shaAsset.browser_download_url).catch(() => null) : null;
      latest = parseRelease(release, shaText);
      expiresAt = now() + ttlMs;
    } catch {
      // Keep serving what we had; try again soon rather than waiting out a full ttl.
      expiresAt = now() + Math.min(ttlMs, RETRY_AFTER_FAILURE_MS);
    }
    return latest;
  }
  return {
    async get() {
      if (now() < expiresAt) return latest;
      inFlight ||= refresh().finally(() => { inFlight = null; });
      return inFlight;
    }
  };
}
