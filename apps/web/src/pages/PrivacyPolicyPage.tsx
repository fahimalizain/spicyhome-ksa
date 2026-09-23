const CONTACT_EMAIL = 'fahimalizain@gmail.com';

export function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-gray-400">Effective date: September 23, 2026</p>

      <section>
        <h2 className="mt-10 text-xl font-semibold">About this app</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          SpicyHome POS is an Android tablet app for restaurant staff. It is the order-taking
          companion for the SpicyHome point-of-sale system and runs on Android 8.0 and later. The
          app name is SpicyHome POS and the package name is com.spicyhome.pos.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app connects to the restaurant&apos;s own SpicyHome server on the local network. Staff
          enter the server address, then sign in with a username and PIN issued on that server.
          There is no SpicyHome cloud account and no sign-up. The app does not ask for an email
          address, a phone number, or a full name.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">Information stored on your device</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app stores a small preferences file on the tablet. The file is named spicyhome_prefs
          and it holds:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-gray-300">
          <li>the address of the restaurant&apos;s server;</li>
          <li>an access token that keeps the staff member signed in;</li>
          <li>the username of the signed-in staff member.</li>
        </ul>
        <p className="mt-3 leading-relaxed text-gray-300">
          Signing out removes the access token and the username. The server address is kept so staff
          do not have to enter it again.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          Clearing the app&apos;s data or uninstalling the app removes everything the app has stored
          on the device. The app keeps no other files, databases, or logs.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">
          Information stored on your restaurant&apos;s server
        </h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          Orders, tables, menu items, payments, staff accounts, and business-day sessions are stored
          by the restaurant&apos;s own SpicyHome server. The restaurant operates and controls that
          server. The app vendor does not operate the server and does not receive the data stored
          there, except for the diagnostics described in the next section.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          The restaurant operator decides how long server data is kept and how it is deleted.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">Diagnostics and crash reports</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app can send diagnostics to Sentry (sentry.io). Sentry is the only third-party service
          the app uses. Sentry is only active when the app build includes a Sentry connection. If
          the build has no Sentry connection, no diagnostics are sent anywhere.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          When Sentry is active, the app can send:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-gray-300">
          <li>
            crash reports and error events, including stack traces, thread dumps, and app and device
            information;
          </li>
          <li>
            the signed-in staff username, attached to error events as the Sentry user; this is
            cleared when the staff member signs out or when authentication fails;
          </li>
          <li>
            HTTP request and response details: URL, method, status code, headers, and bodies
            truncated to 100,000 characters. Failed requests with an HTTP status from 400 to 599 are
            sent as error events with their response bodies;
          </li>
          <li>
            request bodies that can include sign-in credentials (username and PIN) and order or
            payment contents, and request headers that can include the access token;
          </li>
          <li>performance traces and profiling at full sample rate;</li>
          <li>session replay recordings of app sessions, and user-interaction tracing.</li>
        </ul>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app does not filter personal information out of these diagnostics before sending them.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          Sentry controls how long it keeps these diagnostics. See the retention and deletion
          section below to ask for their removal.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">What the app does not do</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app does not show advertising and does not include any advertising SDK. It has no
          in-app purchases and no subscriptions. It does not use analytics or crash-reporting SDKs
          other than Sentry when Sentry is configured. It does not sell data, and it does not share
          data for advertising. The only third party that can receive data is the Sentry service
          described above, and only when Sentry is configured.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app does not create accounts or profiles, does not collect email addresses, does not
          track location, and does not access contacts, photos, or files.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app requests only two Android permissions: internet access and network state. It does
          not request location, camera, microphone, contacts, storage, or any other permission.
        </p>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app does not encrypt traffic to the restaurant&apos;s server. It talks to the server
          over the local network using unencrypted HTTP, by design.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">Children</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          The app is a business tool for restaurant staff. It is not directed to children and it is
          not intended for use by children.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">Retention and deletion</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-gray-300">
          <li>
            On the device: the server address, access token, and username stay on the tablet until
            the staff member signs out, clears the app&apos;s data, or uninstalls the app. Signing
            out removes the access token and the username. Clearing the app&apos;s data or
            uninstalling the app removes all of it.
          </li>
          <li>
            On the restaurant&apos;s server: the restaurant operator controls retention and deletion
            of server data.
          </li>
          <li>
            In Sentry: Sentry controls how long diagnostics are kept. To ask for diagnostics to be
            removed, contact us at the email address below.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">Changes to this policy</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          We may update this policy. When we do, we will post the new version on this page and show
          a new effective date at the top. The new version takes effect when it is posted.
        </p>
      </section>

      <section>
        <h2 className="mt-10 text-xl font-semibold">Contact</h2>
        <p className="mt-3 leading-relaxed text-gray-300">
          Questions about this policy, or requests to remove diagnostics data, can be sent to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>

      <footer className="mt-16 border-t border-gray-800 pt-8 text-sm text-gray-500">
        <a href={import.meta.env.BASE_URL} className="text-brand-500 hover:underline">
          SpicyHome POS
        </a>
        <span> · </span>
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-500 hover:underline">
          {CONTACT_EMAIL}
        </a>
      </footer>
    </main>
  );
}
