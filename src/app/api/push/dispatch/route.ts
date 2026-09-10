import { timingSafeEqual } from "node:crypto";
import { dispatchPush } from "@/lib/push-worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response(null, { status: 401 });
  try {
    return Response.json({ processed: await dispatchPush() });
  } catch {
    return Response.json({ error: "Dispatch unavailable" }, { status: 503 });
  }
}
