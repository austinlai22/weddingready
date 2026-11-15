import Link from 'next/link';

export function DocPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="app-main">
      <article className="doc">
        <p><Link href="/train">← Back to your plan</Link></p>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}
