import Image from "next/image";
import { PublicTracker } from "@/components/PublicTracker";

export default function HomePage() {
  return (
    <main className="page-shell">
      <div className="page-frame page-frame-simple">
        <section className="hero hero-simple">
          <div className="hero-simple-content">
            <h1>Arsenal Parade Tracker</h1>
            <div className="hero-logo-shell">
              <Image src="/arsenal-logo-cropped.png" alt="Arsenal logo" width={88} height={96} className="hero-logo" priority />
            </div>
          </div>
        </section>
        <PublicTracker />
      </div>
    </main>
  );
}
