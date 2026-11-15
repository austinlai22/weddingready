import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="app-main">
      <div className="stack" style={{ paddingTop: 60 }}>
        <section className="hero">
          <p className="kicker">Offline</p>
          <h1>You’re offline.</h1>
          <p className="pep">Your plan and logs are saved on this device. Open the app again once it has loaded at least once with a connection.</p>
          <div><Link href="/train" className="btn" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Go to today</Link></div>
        </section>
      </div>
    </main>
  );
}
