import Link from "next/link";
import { AdminForm } from "@/components/AdminForm";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <section className="hero">
          <span className="eyebrow">Manual Update Console</span>
          <h1>Tracker Admin</h1>
          <p>
            Use this page to save the latest confirmed convoy sighting from public stories, livestreams,
            or other reports. Each save recalculates the estimated speed used on the public map.
          </p>
        </section>

        <section className="admin-card">
          <p className="admin-note">
            Public page: <Link className="inline-link" href="/">open tracker</Link>
          </p>
          <AdminForm />
        </section>
      </div>
    </main>
  );
}
