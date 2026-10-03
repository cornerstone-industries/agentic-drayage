import Link from "next/link";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-2xl font-extrabold font-wide">Sign-in link failed</h1>
      <p className="text-muted">{error ? `Supabase said: ${error}` : "The link was invalid or expired."}</p>
      <Link href="/login" className="btn-ghost w-fit">
        Back to sign in
      </Link>
    </main>
  );
}
