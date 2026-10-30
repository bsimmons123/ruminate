import { CONTACT_EMAIL, SERVICE } from "./legal";

export function DeleteAccountPage({ onBack }: { onBack: () => void }) {
  const requestUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Ruminate account deletion request")}&body=${encodeURIComponent("Please delete my Ruminate account and its associated data. My account email is: ")}`;
  return <main className="page legal-page">
    <section className="page-title"><p className="eyebrow">Your account</p><h1>Delete your {SERVICE} account</h1></section>
    <article className="legal-body">
      <p>You can delete your account from Settings in Ruminate on the web or in the app. Choose “Delete my account,” type your account email, then confirm “Permanently delete.”</p>
      <p>If you no longer have the app or cannot sign in, you can request deletion by email. Send the request from your account email address when possible. We will verify account ownership before deleting any data. Never send your password.</p>
      <p><a href={requestUrl}>Request account deletion by email</a></p>
      <p>You can also write directly to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the subject “Ruminate account deletion request.”</p>
      <h2>What gets deleted</h2>
      <p>Deletion permanently removes your account, saved library, passages, review history, tags, settings, and reminder registrations from our database. In-app deletion also clears that account’s cached data on the device where you delete it. Clear Ruminate’s storage on any other devices to remove their offline copies.</p>
      <p>Deletion cannot be undone. Security records and infrastructure logs may remain under our retention practices; see the <a href="/privacy">Privacy Policy</a>.</p>
    </article>
    <button className="text-button legal-back" onClick={onBack}>Back to {SERVICE}</button>
  </main>;
}
