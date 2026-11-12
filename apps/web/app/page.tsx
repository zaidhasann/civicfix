import Link from 'next/link';

const dispatches = [
  [
    '01',
    'Spot it',
    'A photo, a place, and the detail that makes the problem impossible to ignore.',
  ],
  [
    '02',
    'Pin it',
    'Choose the exact issue location, even when you are reporting from somewhere else.',
  ],
  [
    '03',
    'Send it',
    'A department-ready draft lands in your hands first. You decide what leaves CivicFix.',
  ],
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f3f1ea] text-[#111318]">
      <header className="border-b-2 border-[#111318] bg-[#f3f1ea]">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-10">
          <Link
            className="group flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6f000]"
            href="/"
          >
            <span className="flex h-9 w-9 items-center justify-center bg-[#b6f000] text-lg font-black">
              C
            </span>
            <span className="text-xl font-black tracking-[-0.06em]">
              CIVIC<span className="text-[#ff5a36]">FIX</span>
            </span>
          </Link>
          <nav aria-label="Account navigation" className="flex items-center gap-3">
            <Link
              className="rounded px-3 py-2 text-sm font-bold uppercase tracking-[0.12em] hover:text-[#ff5a36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6f000]"
              href="/login"
            >
              Sign in
            </Link>
            <Link
              className="rounded bg-[#111318] px-4 py-3 text-sm font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[#ff5a36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6f000] focus-visible:ring-offset-2"
              href="/signup"
            >
              Join CivicFix
            </Link>
          </nav>
        </div>
      </header>

      <div className="border-b-2 border-[#111318] bg-[#b6f000]">
        <div className="mx-auto flex max-w-[1440px] items-center gap-5 overflow-hidden px-5 py-2.5 text-xs font-black uppercase tracking-[0.2em] sm:px-10">
          <span className="shrink-0 text-[#ff5a36]">Open channel</span>
          <span aria-hidden="true">///</span>
          <span className="truncate">Report what needs fixing. Keep the receipt.</span>
          <span aria-hidden="true" className="ml-auto hidden sm:inline">
            India / Everywhere
          </span>
        </div>
      </div>

      <section className="mx-auto grid max-w-[1440px] border-x-0 border-[#111318] lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border-b-2 border-[#111318] px-5 pb-14 pt-16 sm:px-10 sm:pb-24 sm:pt-24 lg:border-b-0 lg:border-r-2 lg:pr-16">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#ff5a36]">
            A public repair desk
          </p>
          <h1 className="mt-7 max-w-5xl text-[clamp(4rem,10vw,9.5rem)] font-black uppercase leading-[0.82] tracking-[-0.09em]">
            The city is a shared draft.
          </h1>
          <div className="mt-12 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
            <p className="max-w-xl text-xl font-medium leading-8 sm:text-2xl">
              CivicFix turns the things you notice on your street into clear, trackable action â€”
              without hiding the process behind a black box.
            </p>
            <Link
              className="inline-flex min-h-14 items-center justify-center gap-3 bg-[#ff5a36] px-6 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6f000] focus-visible:ring-offset-2"
              href="/report"
            >
              File a report <span className="text-xl">â†—</span>
            </Link>
          </div>
        </div>

        <div className="relative min-h-[520px] bg-[#111318] px-5 py-8 text-[#f3f1ea] sm:px-10 sm:py-12">
          <div className="absolute right-8 top-8 h-20 w-20 rounded-full border border-[#b6f000]/50 sm:right-12 sm:top-12">
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#b6f000]" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b6f000]">
            Dispatch / 0001
          </p>
          <div className="mt-32 max-w-sm border-l-2 border-[#ff5a36] pl-5">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#a6a7ad]">
              Your report is not a form
            </p>
            <p className="mt-4 text-3xl font-black uppercase leading-tight tracking-[-0.04em]">
              It is a signal with a paper trail.
            </p>
          </div>
          <div className="absolute bottom-8 left-5 right-5 border-t border-[#f3f1ea]/25 pt-4 sm:bottom-12 sm:left-10 sm:right-10">
            <div className="flex items-end justify-between gap-5">
              <p className="max-w-[220px] text-sm leading-6 text-[#a6a7ad]">
                Private by default. Visible when you choose. Approved by you before sending.
              </p>
              <span className="text-6xl font-black leading-none text-[#b6f000]">â†’</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y-2 border-[#111318] bg-white">
        <div className="mx-auto grid max-w-[1440px] md:grid-cols-3">
          {dispatches.map(([number, title, description], index) => (
            <article
              className={`group min-h-64 px-5 py-8 sm:px-10 sm:py-10 ${
                index < dispatches.length - 1
                  ? 'border-b-2 border-[#111318] md:border-b-0 md:border-r-2'
                  : ''
              }`}
              key={number}
            >
              <div className="flex items-start justify-between">
                <span className="text-6xl font-black leading-none tracking-[-0.08em] text-[#ff5a36] transition group-hover:text-[#b6f000]">
                  {number}
                </span>
                <span aria-hidden="true" className="text-3xl font-light">
                  â†—
                </span>
              </div>
              <h2 className="mt-12 text-2xl font-black uppercase tracking-[-0.04em]">{title}</h2>
              <p className="mt-3 max-w-sm text-base leading-7 text-[#555860]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-12 px-5 py-20 sm:px-10 sm:py-28 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#ff5a36]">
            The CivicFix rule
          </p>
          <h2 className="mt-5 text-5xl font-black uppercase leading-[0.9] tracking-[-0.07em] sm:text-7xl">
            No silent sends.
          </h2>
        </div>
        <div className="max-w-3xl">
          <p className="text-2xl font-medium leading-9 sm:text-3xl sm:leading-10">
            We help with the boring parts â€” classification, jurisdiction, and a useful first
            draft. You keep the final word.
          </p>
          <div className="mt-10 border-t-2 border-[#111318] pt-5">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff5a36]">
                  01 / See
                </p>
                <p className="mt-2 font-bold">What the photo says</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff5a36]">
                  02 / Edit
                </p>
                <p className="mt-2 font-bold">What the message says</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff5a36]">
                  03 / Decide
                </p>
                <p className="mt-2 font-bold">Whether it goes out</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t-2 border-[#111318] bg-[#ff5a36] px-5 py-16 text-white sm:px-10 sm:py-20">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-10 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#b6f000]">
              Your street is saying something
            </p>
            <h2 className="mt-4 max-w-3xl text-5xl font-black uppercase leading-[0.9] tracking-[-0.07em] sm:text-7xl">
              Make it legible.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-14 items-center justify-center bg-[#b6f000] px-6 text-sm font-black uppercase tracking-[0.12em] text-[#111318] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6f000] focus-visible:ring-offset-2 focus-visible:ring-offset-[#ff5a36]"
              href="/report"
            >
              Start a report
            </Link>
            <Link
              className="inline-flex min-h-14 items-center justify-center border-2 border-white px-6 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:bg-white hover:text-[#ff5a36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6f000]"
              href="/feed"
            >
              Read the feed
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-[#111318] bg-[#f3f1ea]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-7 text-sm font-bold sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <p>CIVICFIX / PUBLIC REPAIR DESK</p>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-5 uppercase tracking-[0.1em]"
          >
            <Link className="hover:text-[#ff5a36]" href="/map">
              Map
            </Link>
            <Link className="hover:text-[#ff5a36]" href="/feed">
              Feed
            </Link>
            <Link className="hover:text-[#ff5a36]" href="/login">
              Sign in
            </Link>
            <Link className="hover:text-[#ff5a36]" href="/signup">
              Join
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
