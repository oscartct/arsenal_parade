import { NextRequest, NextResponse } from "next/server";
import { saveSighting, getAdminPayload } from "@/lib/tracker-store";
import { ADMIN_PASSWORD } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getAdminPayload();

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";

    if (ADMIN_PASSWORD && adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
    }

    const checkpointId = typeof body.checkpointId === "string" ? body.checkpointId : "";
    const sightingTimeIso = typeof body.sightingTimeIso === "string" ? body.sightingTimeIso : "";
    const sourceNote = typeof body.sourceNote === "string" ? body.sourceNote : "";
    const confidence = typeof body.confidence === "string" ? body.confidence : "";

    if (!checkpointId || !sightingTimeIso || !sourceNote.trim() || !confidence) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (!["low", "medium", "high"].includes(confidence)) {
      return NextResponse.json({ error: "Invalid confidence value." }, { status: 400 });
    }

    const result = await saveSighting({
      checkpointId,
      sightingTimeIso,
      sourceNote,
      confidence
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save sighting.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
