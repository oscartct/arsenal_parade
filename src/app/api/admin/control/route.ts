import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PASSWORD } from "@/lib/config";
import {
  fullResetTrackerState,
  clearManualSpeedOverride,
  resetLiveRunStart,
  setManualSpeedOverride,
  startLiveRunNow
} from "@/lib/tracker-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";

    if (ADMIN_PASSWORD && adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
    }

    const action = typeof body.action === "string" ? body.action : "";

    if (action === "start-live-run") {
      const control = await startLiveRunNow();
      return NextResponse.json({ ok: true, control });
    }

    if (action === "reset-live-run") {
      const control = await resetLiveRunStart();
      return NextResponse.json({ ok: true, control });
    }

    if (action === "set-manual-speed") {
      const manualSpeedKmh = typeof body.manualSpeedKmh === "number" ? body.manualSpeedKmh : Number(body.manualSpeedKmh);
      const control = await setManualSpeedOverride(manualSpeedKmh);
      return NextResponse.json({ ok: true, control });
    }

    if (action === "clear-manual-speed") {
      const control = await clearManualSpeedOverride();
      return NextResponse.json({ ok: true, control });
    }

    if (action === "full-reset") {
      const control = await fullResetTrackerState();
      return NextResponse.json({ ok: true, control });
    }

    return NextResponse.json({ error: "Invalid control action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update live control settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
