import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PASSWORD, PARADE_START_ISO } from "@/lib/config";
import { clearSightings, startSimulation, stopSimulation } from "@/lib/tracker-store";

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

    if (action === "start") {
      const simulatedStartIso =
        typeof body.simulatedStartIso === "string" && body.simulatedStartIso
          ? body.simulatedStartIso
          : PARADE_START_ISO;
      const resetSightings = body.resetSightings === true;

      if (resetSightings) {
        await clearSightings();
      }

      const simulation = await startSimulation(simulatedStartIso);
      return NextResponse.json({ ok: true, simulation });
    }

    if (action === "stop") {
      const simulation = await stopSimulation();
      return NextResponse.json({ ok: true, simulation });
    }

    return NextResponse.json({ error: "Invalid simulation action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update simulation state.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
