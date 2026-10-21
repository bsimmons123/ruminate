/* Rules for the Android in-app updater live here as pure functions, like installPrompt.ts,
   so they can be tested without a device. The native plugin only downloads and installs. */

/** `GET /api/app/latest`, normalised to camelCase. */
export type LatestRelease = {
  configured: boolean;
  version: string | null;
  versionCode: number | null;
  size: number | null;
  publishedAt: string;
  notes: string;
  sha256: string | null;
};

export function parseLatest(json: unknown): LatestRelease {
  const source = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const text = (key: string) => typeof source[key] === "string" ? source[key] as string : "";
  const number = (key: string) => typeof source[key] === "number" && Number.isFinite(source[key]) ? source[key] as number : null;
  return {
    configured: source.configured === true,
    version: text("version") || null,
    versionCode: number("version_code"),
    size: number("size"),
    publishedAt: text("published_at"),
    notes: text("notes"),
    sha256: text("sha256").toLowerCase() || null
  };
}

/** The release when it is strictly newer than the installed build, otherwise null. */
export function decideUpdate(latest: LatestRelease, installedCode: number): LatestRelease | null {
  if (!latest.configured || latest.version === null || latest.versionCode === null) return null;
  return latest.versionCode > installedCode ? latest : null;
}

/** Opening or resuming the app checks at most this often. */
export const RESUME_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export const shouldCheckForUpdate = (now: number, lastCheck: number, interval = RESUME_CHECK_INTERVAL_MS) => now - lastCheck >= interval;

/** Shown for a release newer than the installed build that the user has not put off with Later. */
export const shouldShowUpdateBanner = (availableCode: number, installedCode: number, dismissedCode: number) =>
  availableCode > installedCode && availableCode > dismissedCode;

/** Values of the matching `PackageInstaller.STATUS_*` constants. */
const STATUS = { blocked: 2, aborted: 3, invalid: 4, conflict: 5, storage: 6, incompatible: 7 };

const CONFLICT_MESSAGE = "Android refused this update because it was signed with a different key than the Ruminate on your phone. " +
  "This one-time conflict needs an uninstall: remove Ruminate, install the new version, and sign in again. " +
  "Uninstalling deletes Ruminate's offline data on this phone; your library and reviews stay on your account. After that, updates install in place.";

export function isSignatureConflict(status: number, message?: string | null): boolean {
  if (status === STATUS.conflict || status === STATUS.incompatible) return true;
  const text = (message || "").toLowerCase();
  return text.includes("signature") || text.includes("update_incompatible") || text.includes("inconsistent certificates");
}

export function installFailureMessage(status: number, message?: string | null): string {
  if (isSignatureConflict(status, message)) return CONFLICT_MESSAGE;
  if (status === STATUS.blocked) return "Android blocked the install. Check that Ruminate is allowed to install apps, then try again.";
  if (status === STATUS.aborted) return "The install was cancelled.";
  if (status === STATUS.storage) return "There is not enough storage to install the update. Free some space and try again.";
  if (status === STATUS.invalid) return "The downloaded file is not a valid app. Try the update again.";
  return message?.trim() ? message.trim().slice(0, 200) : "Android did not finish the install.";
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${Math.floor(bytes / 1_024)} KB`;
  return `${bytes} B`;
}
