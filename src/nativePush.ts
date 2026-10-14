import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiRegisterDevice, apiRemoveDevice } from "./api";

const DEVICE_TOKEN_KEY = "selah-device-token";
let listening = false;
let registeredThisSession = false;
let completeRegistration: ((registered: boolean) => void) | null = null;

export const isNativeApp = Capacitor.isNativePlatform();
export const currentPushToken = () => localStorage.getItem(DEVICE_TOKEN_KEY);

export async function enablePush() {
  if (!isNativeApp) return false;
  if (registeredThisSession) {
    const token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (token) { await apiRegisterDevice(token, Capacitor.getPlatform() as "android" | "ios"); return true; }
  }
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return false;
  if (!listening) {
    listening = true;
    await PushNotifications.addListener("registration", async ({ value }) => {
      localStorage.setItem(DEVICE_TOKEN_KEY, value);
      try { await apiRegisterDevice(value, Capacitor.getPlatform() as "android" | "ios"); completeRegistration?.(true); }
      catch (error) { console.error("Device registration failed", error); completeRegistration?.(false); }
    });
    await PushNotifications.addListener("registrationError", error => { console.error("Push registration failed", error); completeRegistration?.(false); });
    await PushNotifications.addListener("pushNotificationActionPerformed", event => {
      if (event.notification.data?.page === "review") window.dispatchEvent(new Event("selah-open-review"));
    });
  }
  const registered = new Promise<boolean>(resolve => {
    const timeout = window.setTimeout(() => { completeRegistration = null; resolve(false); }, 15000);
    completeRegistration = value => { window.clearTimeout(timeout); completeRegistration = null; resolve(value); };
  });
  try { await PushNotifications.register(); }
  catch (error) { console.error("Push registration failed", error); completeRegistration?.(false); }
  registeredThisSession = await registered;
  return registeredThisSession;
}

export async function disablePush(removeFromServer = true) {
  if (!isNativeApp) return;
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (token && removeFromServer) { try { await apiRemoveDevice(token); } catch (error) { console.error("Device removal failed", error); } }
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  registeredThisSession = false;
}
