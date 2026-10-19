/* Deciding who to show the "Add to Home Screen" prompt to is easy to get subtly wrong,
   so the rules live here as pure functions rather than inline in the component. */

export type InstallEnvironment = {
  userAgent: string;
  maxTouchPoints: number;
  /** Already launched from the Home Screen, so there is nothing to install. */
  standalone: boolean;
  /** The user closed the banner before. */
  dismissed: boolean;
  /** Running inside Capacitor, where the app is already installed. */
  native: boolean;
  /** A beforeinstallprompt event is available (Chromium), so we can install directly. */
  hasPrompt: boolean;
};

/* iPadOS reports a Macintosh user agent and is only distinguishable by touch support.
   Third-party iOS browsers and in-app webviews render with WebKit but cannot add to the
   Home Screen, so prompting them sends the user looking for a control that is not there. */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const iphone = /iPad|iPhone|iPod/.test(userAgent);
  const ipad = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (!iphone && !ipad) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\/|Twitter/.test(userAgent);
}

export function shouldOfferInstall(environment: InstallEnvironment): boolean {
  const { userAgent, maxTouchPoints, standalone, dismissed, native, hasPrompt } = environment;
  if (native || standalone || dismissed) return false;
  return hasPrompt || isIosSafari(userAgent, maxTouchPoints);
}
