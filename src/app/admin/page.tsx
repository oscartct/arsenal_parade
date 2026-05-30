import Link from "next/link";
import { AdminForm } from "@/components/AdminForm";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <section className="hero">
          <span className="eyebrow">Tester / Admin</span>
          <h1>Manual Sighting Updates</h1>
          <p>
            Click on the map to place the latest confirmed sighting, then save it with a time and source note.
            The public page will refresh from that update automatically.
          </p>
        </section>
        <p className="admin-note">
          Open this page directly at <strong>/admin</strong>. It is not linked from the public tracker.
        </p>
        <p className="admin-note">
          Public page: <Link className="inline-link" href="/">open tracker</Link>
        </p>
        <AdminForm />
      </div>
    </main>
  );
}
