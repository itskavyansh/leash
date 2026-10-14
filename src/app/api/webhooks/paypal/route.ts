import { NextRequest, NextResponse } from "next/server";
import { applyWebhookEvent, verifyWebhook, WebhookEventPayload } from "@/lib/paypal/webhook";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // Convert Next.js headers to plain Record<string, string>
  const headersRecord: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headersRecord[key] = value;
  });

  let verified = false;
  try {
    verified = await verifyWebhook(headersRecord, rawBody);
  } catch (err) {
    console.error("Webhook verification check failed:", err);
    return new NextResponse(null, { status: 401 });
  }

  if (!verified) {
    return new NextResponse(null, { status: 401 });
  }

  let event: WebhookEventPayload;
  try {
    event = JSON.parse(rawBody) as WebhookEventPayload;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  let handledResult = false;
  let note = "unknown";
  try {
    const result = await applyWebhookEvent(event);
    handledResult = result.handled;
    note = result.note;
  } catch (err) {
    console.error("Error applying webhook event:", err);
  }

  // Log webhook receipt: event_type, event id, and result (no headers, no secrets)
  console.log(
    `[PayPal Webhook] received: ${event.event_type} | id: ${event.id} | handled: ${handledResult} | note: ${note}`
  );

  // Always return 200 with { received: true } once verified so PayPal doesn't retry endlessly
  return NextResponse.json({ received: true }, { status: 200 });
}
