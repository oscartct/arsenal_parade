import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PASSWORD } from "@/lib/config";
import { saveRoute } from "@/lib/tracker-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";

    if (ADMIN_PASSWORD && adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
    }

    const coordinates = Array.isArray(body.coordinates)
      ? body.coordinates.filter(
          (entry: unknown): entry is [number, number] =>
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "number" &&
            typeof entry[1] === "number"
        )
      : [];

    const result = await saveRoute({ coordinates });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save route.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
