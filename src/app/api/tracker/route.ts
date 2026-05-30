import { NextRequest, NextResponse } from "next/server";
import { getTrackerPayload } from "@/lib/tracker-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nowParam = request.nextUrl.searchParams.get("now");
  const payload = await getTrackerPayload(nowParam ?? undefined);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
