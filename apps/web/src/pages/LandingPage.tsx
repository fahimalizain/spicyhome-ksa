export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">SpicyHome POS</h1>
      <p className="mt-4 text-lg text-gray-300">
        Order-taking companion for the SpicyHome restaurant point-of-sale system.
      </p>
      <p className="mt-4 text-gray-400">
        It runs against the restaurant&apos;s own SpicyHome server on the local network. Restaurant
        staff use it to take orders at the table.
      </p>
      <div className="mt-10">
        <a
          href={`${import.meta.env.BASE_URL}privacy/`}
          className="inline-flex min-h-touch items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-lg font-semibold text-white hover:bg-brand-700"
        >
          Read the privacy policy
        </a>
      </div>
      <footer className="mt-16 text-sm text-gray-500">
        Questions? Contact{' '}
        <a href="mailto:fahimalizain@gmail.com" className="text-brand-500 hover:underline">
          fahimalizain@gmail.com
        </a>
      </footer>
    </main>
  );
}
