import { Link, createFileRoute } from "@tanstack/react-router";

import { Contact, LegalPage } from "@/components/legal/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — FireOTA" },
      { name: "description", content: "The terms that govern use of the FireOTA service, SDK and CLI." },
      { property: "og:title", content: "Terms of Service — FireOTA" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms govern your use of FireOTA — the website, dashboard, API, the <code>@fireota/react-native</code> SDK and the{" "}
          <code>@fireota/cli</code> CLI (together, the "Service"). By creating an account or using the Service you agree to them. If you
          use the Service for an organization, you confirm you may accept these terms on its behalf.
        </p>
      }
      sections={[
        {
          id: "service",
          title: "The Service",
          body: (
            <p>
              FireOTA lets you publish, roll out, pause and roll back over-the-air JavaScript updates for React Native apps. Update packages
              are stored in, and served from, a Firebase project that you own and connect. FireOTA does not charge for its core OTA
              management features; Google bills your Firebase project directly for storage and bandwidth.
            </p>
          ),
        },
        {
          id: "accounts",
          title: "Accounts and security",
          body: (
            <ul>
              <li>Provide accurate information and keep your credentials, API keys and webhook secrets confidential.</li>
              <li>You are responsible for activity in your workspace, including actions by team members and API keys you create.</li>
              <li>Tell us promptly via <Contact /> if you believe your account has been compromised.</li>
            </ul>
          ),
        },
        {
          id: "firebase",
          title: "Your Firebase project and content",
          body: (
            <>
              <p>
                You keep all rights to your apps, code, update packages and data ("Your Content"). You grant FireOTA the limited permission
                needed to store, process, upload, verify and delete Your Content in your Firebase project in order to provide the Service.
              </p>
              <p>
                You are responsible for your Firebase project — its billing, security rules, quotas and the Google account permissions you
                grant. Disconnecting a project or deleting your account does not delete files already in your bucket.
              </p>
            </>
          ),
        },
        {
          id: "store-rules",
          title: "App store rules and your users",
          body: (
            <ul>
              <li>
                You are solely responsible for ensuring your updates comply with the Apple App Store and Google Play policies. Over-the-air
                updates must not change your app's primary purpose or bypass store review.
              </li>
              <li>You must disclose to your app's users, in your privacy policy and store data-safety forms, the update telemetry the SDK sends.</li>
              <li>You are responsible for testing releases. Use staged rollouts, and do not publish code you do not have the right to distribute.</li>
            </ul>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <>
              <p>You must not use the Service to:</p>
              <ul>
                <li>distribute malware, spyware or code that harms users or devices, or that deceives users;</li>
                <li>violate any law, third-party rights or platform policies;</li>
                <li>access another organization's data, probe or overload the Service, or circumvent rate limits, permissions or security;</li>
                <li>resell or provide the Service to third parties in a way these terms do not allow.</li>
              </ul>
              <p>We may suspend access that puts the Service, other customers or end users at risk.</p>
            </>
          ),
        },
        {
          id: "open-source",
          title: "SDK and CLI",
          body: (
            <p>
              The SDK and CLI are open source under the MIT License, which governs your use of their source code. These terms govern your
              use of the hosted Service they connect to.
            </p>
          ),
        },
        {
          id: "privacy",
          title: "Privacy",
          body: (
            <p>
              Our <Link to="/privacy" className="text-brand hover:underline">Privacy Policy</Link> explains how we handle personal data,
              including data received from Google APIs.
            </p>
          ),
        },
        {
          id: "availability",
          title: "Availability and changes",
          body: (
            <p>
              The SDK and CLI are in beta (version 0.x). We work to keep the Service available and secure, but it may change, be interrupted
              or be discontinued. We will give reasonable notice of material changes where possible.
            </p>
          ),
        },
        {
          id: "disclaimer",
          title: "Disclaimer",
          body: (
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT UPDATES WILL BE DELIVERED TO
              EVERY DEVICE, OR THAT THE SERVICE WILL BE ERROR-FREE OR UNINTERRUPTED.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Limitation of liability",
          body: (
            <p>
              TO THE EXTENT PERMITTED BY LAW, FIREOTA WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES,
              OR FOR LOST PROFITS, REVENUE, DATA OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE OR FROM UPDATES YOU PUBLISH. OUR TOTAL
              LIABILITY FOR ANY CLAIM IS LIMITED TO THE AMOUNT YOU PAID US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE CLAIM.
            </p>
          ),
        },
        {
          id: "termination",
          title: "Termination",
          body: (
            <p>
              You may stop using the Service at any time. We may suspend or terminate access for breach of these terms. Sections that by
              their nature should survive termination — including ownership, disclaimers and limitation of liability — survive.
            </p>
          ),
        },
        {
          id: "general",
          title: "Changes and contact",
          body: (
            <p>
              We may update these terms; the "last updated" date shows the current version, and continued use after a change means you
              accept it. Questions: <Contact />.
            </p>
          ),
        },
      ]}
    />
  );
}
