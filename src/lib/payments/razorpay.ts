import crypto from 'node:crypto';
import type {
  CreateIntentInput,
  PaymentIntent,
  PaymentProvider,
  RefundInput,
  RefundResult,
  VerifiedEvent,
  VerifyCallbackInput,
} from './types';

/**
 * Razorpay adapter.
 *
 * Implemented against the REST API directly rather than the SDK, which keeps the
 * dependency surface small and makes the exact requests visible. Razorpay works
 * in paise natively, so no conversion is needed anywhere in this file.
 *
 * Two verification paths exist and both are implemented, because they are not
 * interchangeable:
 *
 *   - verifyClientCallback checks the handshake the browser returns after the
 *     checkout sheet closes. It tells you the user saw a success screen.
 *   - verifyWebhook checks the server-to-server notification. It is the only one
 *     that may be trusted to move a booking to confirmed, because the browser
 *     callback can be replayed or fabricated by whoever controls the browser.
 *
 * The booking is confirmed on the webhook. The client callback is used only to
 * decide what to show the user while the webhook is in flight.
 */

const API_BASE = 'https://api.razorpay.com/v1';

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  readonly isConfigured: boolean;

  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(config: { keyId?: string; keySecret?: string; webhookSecret?: string }) {
    this.keyId = config.keyId ?? '';
    this.keySecret = config.keySecret ?? '';
    this.webhookSecret = config.webhookSecret ?? '';
    this.isConfigured = Boolean(this.keyId && this.keySecret);
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (!this.isConfigured) {
      throw new Error('Razorpay is selected but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing');
    }

    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        // Razorpay treats a repeated receipt as the same order, which is what
        // makes a double-clicked Pay button safe at the gateway as well as in
        // our own database.
        'X-Razorpay-Account': '',
      },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        receipt: input.idempotencyKey.slice(0, 40),
        notes: {
          booking_id: input.bookingId,
          booking_code: input.bookingCode,
          ...input.notes,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Razorpay order creation failed with ${response.status}: ${text}`);
    }

    const order = (await response.json()) as { id: string; amount: number; currency: string };

    return {
      provider: 'razorpay',
      providerOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      clientPayload: {
        provider: 'razorpay',
        key: this.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        name: 'ParkSpace',
        description: `Parking booking ${input.bookingCode}`,
        prefill: {
          name: input.customer.name ?? '',
          email: input.customer.email ?? '',
          contact: input.customer.phone ?? '',
        },
      },
    };
  }

  verifyWebhook(input: VerifyCallbackInput): VerifiedEvent | null {
    if (!this.webhookSecret) return null;

    const provided = input.headers['x-razorpay-signature'];
    if (!provided) return null;

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(input.rawBody)
      .digest('hex');

    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      return null;
    }

    const payment = parsed?.payload?.payment?.entity;
    const refund = parsed?.payload?.refund?.entity;
    const eventType = String(parsed?.event ?? '');

    // Razorpay does not put a stable event id in the body for every event type,
    // so we derive one from the entity and the event name. Combined with the
    // unique constraint on (provider, provider_event_id), this still gives
    // exactly-once processing.
    const entityId = payment?.id ?? refund?.id ?? 'unknown';
    const eventId = `${eventType}:${entityId}`;

    let status: VerifiedEvent['status'] = 'ignored';
    if (eventType === 'payment.captured') status = 'captured';
    else if (eventType === 'payment.authorized') status = 'authorized';
    else if (eventType === 'payment.failed') status = 'failed';
    else if (eventType.startsWith('refund.')) status = 'refunded';

    return {
      eventId,
      eventType,
      providerOrderId: payment?.order_id ?? null,
      providerPaymentId: payment?.id ?? refund?.payment_id ?? null,
      amount: typeof payment?.amount === 'number' ? payment.amount : null,
      status,
      method: payment?.method ?? null,
      failureCode: payment?.error_code ?? null,
      failureReason: payment?.error_description ?? null,
      payload: parsed,
    };
  }

  verifyClientCallback(fields: Record<string, string>): boolean {
    const orderId = fields.razorpay_order_id;
    const paymentId = fields.razorpay_payment_id;
    const signature = fields.razorpay_signature;
    if (!orderId || !paymentId || !signature || !this.keySecret) return false;

    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const response = await fetch(`${API_BASE}/payments/${input.providerPaymentId}/refund`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amount,
        speed: 'normal',
        notes: { reason: input.reason.slice(0, 250) },
        receipt: input.idempotencyKey.slice(0, 40),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Razorpay refund failed with ${response.status}: ${text}`);
    }

    const refund = (await response.json()) as { id: string; status: string; amount: number };

    return {
      providerRefundId: refund.id,
      status:
        refund.status === 'processed'
          ? 'completed'
          : refund.status === 'failed'
            ? 'failed'
            : 'processing',
      amount: refund.amount,
    };
  }
}
