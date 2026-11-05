import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiUrl } from "../api";
import { CONTACT_EMAIL, SERVICE } from "./legal";

export function HelpPage({ email = "", onBack }: { email?: string; onBack: () => void }) {
  const [accessKey, setAccessKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    fetch(apiUrl("/support-config"), { signal: controller.signal, credentials: "omit" })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted && typeof data.accessKey === "string") setAccessKey(data.accessKey.trim());
      })
      .catch(() => {})
      .finally(() => { window.clearTimeout(timeout); setLoading(false); });
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !accessKey) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (fields.get("botcheck")) return;
    submitting.current = true;
    setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST", credentials: "omit", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: accessKey, from_name: "Ruminate Help",
          subject: `Ruminate help: ${fields.get("topic")}`,
          email: String(fields.get("email")).trim(),
          topic: fields.get("topic"), message: String(fields.get("message")).trim(), botcheck: false,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error();
      setSent(true);
    } catch {
      setError("We couldn't confirm your message was sent. Try again or email us directly below.");
    } finally {
      window.clearTimeout(timeout); submitting.current = false; setBusy(false);
    }
  }

  return <main className="page legal-page">
    <section className="page-title"><p className="eyebrow">Here to help</p><h1>Get help</h1><p>Have a question or something to report? Send us a message.</p></section>
    <article className="legal-body">
      {sent ? <div role="status"><h2>Message sent</h2><p>Thanks for reaching out. We’ll reply to the email address you provided.</p><button className="text-button" onClick={() => setSent(false)}>Send another message</button></div> : <>
        <p>Please don’t include passwords or sensitive personal information. Account deletion requests require ownership verification before we delete any data.</p>
        {loading ? <p role="status">Loading contact form…</p> : !accessKey ? <p role="status">Please email us directly for help.</p> : <form className="help-form" onSubmit={submit}>
          <fieldset disabled={busy}>
            <label>What can we help with?<select name="topic" defaultValue="Question"><option>Question</option><option>Bug</option><option>Account deletion</option></select></label>
            <label>Your email<input name="email" type="email" autoComplete="email" defaultValue={email} required maxLength={254} /></label>
            <label>Message<textarea name="message" rows={6} required minLength={10} maxLength={5000} /></label>
            <input type="checkbox" name="botcheck" hidden tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <p>Submitting sends your email address and message through Web3Forms to our help inbox. See our <a href="/privacy">Privacy Policy</a>.</p>
            <button type="submit" className="primary">{busy ? "Sending…" : "Send message"}</button>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>}
      </>}
      <p>You can also email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </article>
    <button className="text-button legal-back" onClick={onBack}>Back to {SERVICE}</button>
  </main>;
}
