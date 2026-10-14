import { createFileRoute } from "@tanstack/react-router";

import { Contact, LegalPage } from "@/components/legal/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — FireOTA" },
      { name: "description", content: "How FireOTA collects, uses, stores and protects your data and your users' data." },
      { property: "og:title", content: "Privacy Policy — FireOTA" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          FireOTA ("FireOTA", "we", "us") is a release-management service that delivers over-the-air JavaScript updates to React
          Native apps from the customer's own Firebase project. This policy explains what data we process when you use the FireOTA
          website, dashboard, API, SDK (<code>@fireota/react-native</code>) and CLI (<code>@fireota/cli</code>), and how we protect it.
        </p>
      }
      sections={[
        {
          id: "collect",
          title: "Information we collect",
          body: (
            <>
              <p><strong>Account information.</strong> Your name, email address and, if you sign in with Google, your profile photo. Passwords are handled by our authentication provider and are never visible to us.</p>
              <p><strong>Workspace data.</strong> Organization names, team members and roles, registered apps (package names, bundle identifiers, runtime versions), channels, release metadata (version, notes, checksums, rollout settings), API key metadata (only a hash of each key), webhook settings, notifications and audit logs of actions taken in your workspace.</p>
              <p><strong>Google / Firebase connection data.</strong> When you connect a Firebase project, the email of the Google account you authorized, the list of Firebase projects it can access, project identifiers and storage bucket names, and an OAuth refresh token.</p>
              <p><strong>Device telemetry from apps using the SDK.</strong> A random installation identifier generated on the device, platform, app/native/runtime versions, the installed release and update events (checked, downloaded, installed, failed, rolled back). The SDK does not collect names, emails, phone numbers, advertising IDs, location or the content of the app.</p>
              <p><strong>Technical data.</strong> IP addresses and request metadata, used for security, abuse prevention and rate limiting.</p>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use information",
          body: (
            <ul>
              <li>To provide the service: authenticate you, run your workspace, store and publish releases, and decide which devices receive an update.</li>
              <li>To operate on your Firebase project at your request: upload, verify and delete update packages in your Cloud Storage bucket.</li>
              <li>To show you analytics about update adoption and failures, and to pause releases automatically when failure rates are high.</li>
              <li>To secure the service: enforce permissions, keep audit logs, detect abuse and rate-limit requests.</li>
              <li>To send service emails such as account confirmation and password resets.</li>
            </ul>
          ),
        },
        {
          id: "google",
          title: "Google user data",
          body: (
            <>
              <p>
                When you connect a Firebase project we request access to your Google account's Firebase and Google Cloud resources. We use
                this access only to list your Firebase projects, verify Cloud Storage access, and upload, read and delete FireOTA update
                packages (under the <code>fireota/</code> folder) in the bucket you choose — and only when you or your team act in FireOTA.
              </p>
              <p>
                FireOTA's use and transfer of information received from Google APIs adheres to the{" "}
                <a className="text-brand hover:underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. We do not use Google user data for advertising, do not sell it, do not use it to
                train AI models, and do not allow humans to read it except with your permission, for security purposes, or where required by law.
              </p>
              <p>OAuth refresh tokens are encrypted at rest with authenticated encryption and are never shown in the dashboard, logs or API responses. You can revoke access at any time from your Google Account's security settings.</p>
            </>
          ),
        },
        {
          id: "storage",
          title: "Where data is stored",
          body: (
            <>
              <p><strong>Update packages</strong> (your JavaScript bundles and assets) are stored in <strong>your own Firebase Cloud Storage bucket</strong>, not on FireOTA servers. Devices download them directly from Google.</p>
              <p><strong>Everything else</strong> is stored in our database hosted by Supabase, with row-level security isolating each organization. The application is hosted on Vercel. These providers process data on our behalf under their own security and privacy commitments.</p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Sharing",
          body: (
            <ul>
              <li>We do not sell personal information or share it for advertising.</li>
              <li>We share data with service providers that run FireOTA (Supabase, Vercel, Google) only as needed to provide the service.</li>
              <li>Webhooks you configure send release events to endpoints you choose.</li>
              <li>We may disclose information if required by law or to protect the security of the service and its users.</li>
            </ul>
          ),
        },
        {
          id: "retention",
          title: "Retention and deletion",
          body: (
            <>
              <p>We keep workspace data while your account is active. Rate-limit records are deleted after one day and unused OAuth sign-in states after ten minutes. Audit logs are kept for the life of the workspace so actions remain traceable.</p>
              <p>Disconnecting a Firebase project stops FireOTA from using it; your bucket and its files stay yours. You can ask us to delete your account and workspace data via <Contact />.</p>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              We use HTTPS everywhere, role-based permissions enforced on the server, tenant isolation in the database, hashed API keys,
              encrypted credentials, signed webhooks, checksum-verified updates and audit logging. No system is perfectly secure, but we
              work to protect your data and will notify affected customers of a breach as required by law.
            </p>
          ),
        },
        {
          id: "your-apps",
          title: "Your apps and your users",
          body: (
            <p>
              If you integrate the SDK, you are responsible for telling your app's users about the device telemetry described above in
              your own privacy policy and store data-safety declarations. The SDK sends only update-related, pseudonymous data.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <p>
              Depending on where you live, you may have the right to access, correct, export or delete your personal data, or to object to
              certain processing. You can update your profile in the dashboard, and make any other request via <Contact />.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>FireOTA is a tool for software developers and is not directed at children under 16. We do not knowingly collect their personal data.</p>,
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <p>
              We may update this policy; the "last updated" date above shows the latest version, and significant changes will be announced
              in the dashboard. Questions: <Contact />.
            </p>
          ),
        },
      ]}
    />
  );
}
