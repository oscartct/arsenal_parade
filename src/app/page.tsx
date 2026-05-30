import { PublicTracker } from "@/components/PublicTracker";

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <section className="hero">
          <span className="eyebrow">Unofficial Approximate Tracker</span>
          <h1>Arsenal Parade Tracker</h1>
          <p>
            Built for live public sightings, quick manual updates, and a simple moving estimate along
            the parade route. The route is currently a placeholder trace based on the PDF map in this
            project.
          </p>
        </section>

        <PublicTracker />
      </div>
    </main>
  );
}
