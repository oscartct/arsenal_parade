import { PublicTracker } from "@/components/PublicTracker";

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="page-frame page-frame-simple">
        <section className="hero hero-simple">
          <h1>Arsenal Parade Tracker</h1>
        </section>
        <PublicTracker />
      </div>
    </main>
  );
}
