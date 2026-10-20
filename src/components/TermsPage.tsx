/* Terms of Service. Operator constants are shared with the Privacy page in ./legal. */

import { CONTACT_EMAIL, EFFECTIVE, JURISDICTION, OPERATOR, SERVICE } from "./legal";

export function TermsPage({ onBack }: { onBack: () => void }) {
  return <div className="page legal-page">
    <section className="page-title">
      <p className="eyebrow">Legal</p>
      <h1>Terms of Service</h1>
      <p>Effective {EFFECTIVE}</p>
    </section>

    <article className="legal-body">
      <p className="legal-lede">
        These terms govern your use of {SERVICE}, a free Scripture memorization service operated
        by {OPERATOR}. By creating an account or using the service, you agree to them. If you do not agree,
        please do not use {SERVICE}. "We" and "us" below mean {OPERATOR}.
      </p>

      <h2>1. The service</h2>
      <p>
        {SERVICE} helps you memorize Scripture through spaced repetition. It is provided free of charge.
        There is no paid tier, no advertising, and no feature that requires payment.
      </p>
      <p>
        {SERVICE} is offered as-is and may change. Features may be added, altered, or removed, and the
        service may be unavailable at times, whether for maintenance or for reasons outside our control.
        We do not guarantee any level of availability.
      </p>

      <h2>2. Your account</h2>
      <p>
        You need an account to save verses and track review progress. You are responsible for keeping
        your password confidential and for activity that occurs under your account. Please use an
        accurate email address, since it is how your account is identified and recovered.
      </p>
      <p>
        You may delete your account at any time from Settings. Deletion is immediate and permanent: your
        account, saved library, passages, review history, and reminder registrations are removed and
        cannot be recovered.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use {SERVICE} for any unlawful purpose, or in violation of the Scripture licensing terms described below.</li>
        <li>Attempt to gain unauthorized access to other accounts, servers, or systems.</li>
        <li>Interfere with the service, including by automated scraping, excessive request volume, or circumventing rate limits.</li>
        <li>Redistribute, resell, or commercially exploit Scripture text obtained through {SERVICE}.</li>
      </ul>
      <p>We may suspend or terminate accounts that violate these terms.</p>

      <h2>4. Scripture texts and third-party rights</h2>
      <p>
        {SERVICE} displays Scripture from several sources, and the rights differ by translation. These
        are not our texts to license to you.
      </p>
      <p>
        <strong>Public domain translations.</strong> The World English Bible (WEB), King James Version (KJV),
        American Standard Version (ASV), and Young's Literal Translation (YLT) are in the public domain in
        the United States. Note that the KJV remains subject to Crown copyright in the United Kingdom.
      </p>
      <p>
        <strong>English Standard Version.</strong> ESV text is provided through the Crossway ESV API and
        remains the copyrighted work of Crossway. It is made available for personal, non-commercial use
        only. You may not copy or download more than 500 verses, or more than one half of any book of the
        ESV Bible. ESV text may not be quoted in any publication made available to the public under a
        Creative Commons license, and may not be translated into any other language. Full attribution
        appears throughout {SERVICE}.
      </p>
      <p>
        Your use of Scripture text through {SERVICE} is subject to these underlying licenses, and access
        to any given translation may change if a provider's terms or availability change.
      </p>

      <h2>5. Your content</h2>
      <p>
        Tags, notes, and other material you add remain yours. You grant {SERVICE} only the permission
        needed to operate the service for you: to store your content, sync it to your devices, and display
        it back to you.
      </p>
      <p>
        Where {SERVICE} shows aggregate information drawn from many accounts, such as how often a tag is
        applied to a verse, it is presented in aggregate and is not attributed to you individually.
      </p>

      <h2>6. Offline use and data on your device</h2>
      <p>
        {SERVICE} stores content on your device so practice works offline. Clearing your browser or app
        storage removes that local copy. Content synced to your account can be restored by signing in
        again; content that never reached the server cannot.
      </p>

      <h2>7. Disclaimer of warranties</h2>
      <p>
        {SERVICE} is provided "as is" and "as available," without warranties of any kind, whether express
        or implied, including merchantability, fitness for a particular purpose, and non-infringement. We
        do not warrant that the service will be uninterrupted, timely, secure, or error-free, or that any
        Scripture text displayed is free from error.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {OPERATOR} will not be liable for any
        indirect, incidental, special, consequential, or exemplary damages, or for any loss of data,
        arising out of or relating to your use of the service. Because {SERVICE} is provided free of
        charge, total liability for any claim relating to the service is limited to one hundred US dollars
        (USD $100).
      </p>
      <p>
        Some jurisdictions do not allow certain limitations, so some of the above may not apply to you.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using {SERVICE} at any time and delete your account from Settings. We may suspend or
        terminate access if these terms are violated, or if the service is discontinued. If the service is
        discontinued, we will make a reasonable effort to give advance notice so you can export or record
        your library.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        These terms may be updated. When changes are material, the effective date above will change and
        notice will be given in the app. Continuing to use {SERVICE} after a change means you accept the
        revised terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of {JURISDICTION}, where {OPERATOR} is based, without regard
        to conflict-of-law rules.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>

    <button className="text-button legal-back" onClick={onBack}>Back to Ruminate</button>
  </div>;
}
