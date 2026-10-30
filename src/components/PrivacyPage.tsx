/* Privacy Policy. Apple requires a publicly reachable privacy policy for any App Store
   submission that creates accounts, and this doubles as the in-app copy.
   Shares its operator constants with the Terms page. */

import { CONTACT_EMAIL, EFFECTIVE, OPERATOR, SERVICE } from "./legal";

export function PrivacyPage({ onBack }: { onBack: () => void }) {
  return <div className="page legal-page">
    <section className="page-title">
      <p className="eyebrow">Legal</p>
      <h1>Privacy Policy</h1>
      <p>Effective {EFFECTIVE}</p>
    </section>

    <article className="legal-body">
      <p className="legal-lede">
        {SERVICE} is operated by {OPERATOR}, which is responsible for the personal information described
        here. {SERVICE} collects the little it needs to sync your Scripture practice across your devices.
        There is no advertising, no analytics, no tracking, and nothing is sold or shared for marketing.
      </p>

      <h2>1. What we collect</h2>
      <p><strong>Account information.</strong> Your name, email address, and a password. Passwords are
      stored only as a bcrypt hash; we never store or can read your actual password.</p>
      <p><strong>Your practice data.</strong> The verses in your library, passages you add, your review
      history and ratings, tags you create, and your settings such as preferred translation and daily goal.</p>
      <p><strong>Reminder registration.</strong> If you turn on daily reminders in the mobile app, we store
      the device's push token and its time zone. The time zone is used only to send the reminder at
      9&nbsp;a.m. where you are.</p>
      <p><strong>Ordinary server logs.</strong> Our hosting provider records standard request information,
      including IP address, as part of operating and securing the service.</p>
      <p>We do not collect location, contacts, photos, health data, or device identifiers for advertising.
      There are no third-party analytics or advertising SDKs in {SERVICE}.</p>

      <h2>2. How we use it</h2>
      <p>
        To run the service: authenticating you, saving and syncing your library across devices, scheduling
        reviews, sending the reminders you enable, and protecting the service from abuse. We do not use
        your data to build advertising profiles, and we do not sell it.
      </p>

      <h2>3. Who else is involved</h2>
      <p><strong>Crossway (ESV API).</strong> When you read or add an ESV passage, our server requests that
      passage from Crossway. The request is made by our server rather than your device, so Crossway does
      not receive your IP address or identify you. Public domain translations are bundled with {SERVICE}
      and require no outside request at all.</p>
      <p><strong>Apple and Google (push notifications).</strong> If you enable reminders, delivery goes
      through Apple Push Notification service on iOS or Firebase Cloud Messaging on Android. They receive
      the device token and the notification content needed to deliver it.</p>
      <p><strong>Hosting and infrastructure.</strong> Our hosting and network providers process data on our
      behalf in order to run the service.</p>
      <p>We do not share your information with anyone else, and we do not sell it to anyone for any purpose.
      {OPERATOR} operates other, unrelated businesses; your {SERVICE} data is not shared with them and is
      not used for any purpose other than running {SERVICE}.</p>

      <h2>4. Where your data lives</h2>
      <p>
        Account and practice data is stored in our PostgreSQL database. A copy is also stored on your own
        device so practice works offline, using browser or app storage. Clearing your browser or app
        storage removes the local copy; signing in again restores whatever had synced to the server.
      </p>

      <h2>5. Cookies and similar storage</h2>
      <p>
        On the web, {SERVICE} sets one session cookie to keep you signed in. The mobile app uses a stored
        token instead. {SERVICE} also uses local device storage to hold your offline library and small
        preferences, such as whether you dismissed the install prompt. None of this is used for tracking
        or advertising.
      </p>

      <h2>6. Retention and deletion</h2>
      <p>
        We keep your data for as long as your account exists. You can delete your account at any time from
        Settings. Deletion is immediate and permanent: your account, library, passages, review history,
        settings, and reminder registrations are removed from our database, and the local copy on that
        device is cleared. Deleted data cannot be recovered. Ordinary server logs may persist for a short
        period as part of routine operations and backups.
      </p>

      <h2>7. Your rights</h2>
      <p>If you cannot sign in or no longer have the app, <a href="/delete-account">request account deletion on our website</a>. Offline copies on other devices can be removed by clearing Ruminate’s storage on those devices. Revoked-session records are retained until the session expires to prevent reuse.</p>
      <p>
        Depending on where you live, you may have the right to access, correct, export, or delete your
        personal information, and to object to certain processing. The deletion right is built directly
        into Settings. For anything else, write to us and we will help.
      </p>

      <h2>8. Children</h2>
      <p>
        {SERVICE} is not directed to children under 13, and we do not knowingly collect personal
        information from them. If you believe a child has created an account, contact us and we will
        delete it.
      </p>

      <h2>9. Security</h2>
      <p>
        Traffic is encrypted in transit, passwords are hashed, and sessions can be revoked. No service can
        promise perfect security, but we aim to collect as little as possible so there is less to protect.
      </p>

      <h2>10. Changes</h2>
      <p>
        If this policy changes materially, the effective date above will change and notice will be given in
        the app.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions, requests, or concerns: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>

    <button className="text-button legal-back" onClick={onBack}>Back to {SERVICE}</button>
  </div>;
}
