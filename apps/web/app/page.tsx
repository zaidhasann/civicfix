export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="w-full max-w-2xl space-y-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">CivicFix</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Make your neighborhood better.
        </h1>
        <p className="mx-auto max-w-xl text-lg leading-8 text-slate-300">
          Report local issues, connect with the right department, and keep your community moving.
        </p>
      </section>
    </main>
  );
}
