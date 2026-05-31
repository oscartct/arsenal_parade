import Link from "next/link";
import { AdminForm } from "@/components/AdminForm";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <section className="hero">
          <span className="eyebrow">Tester / Admin</span>
          <h1>Live Run Controls</h1>
          <p>
            Start the public run when the bus actually sets off, then click the map to report each confirmed update.
            The public page will stay in sync automatically.
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
