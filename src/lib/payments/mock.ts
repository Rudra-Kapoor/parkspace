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
 * The mock payment provider.
 *
 * Purpose: let a fresh clone run the complete booking loop, including the
 * webhook path and refunds, with no merchant account and no keys. This is not a
 * stub that returns success unconditionally. It signs its callbacks with HMAC
 * exactly as a real gateway does, so the verification code that runs in
 * production is the same code exercised in development. A signature bug shows up
 * on a laptop rather than on the first real payment.
 *
 * It refuses to run when NODE_ENV is production unless explicitly forced, because
 * a deployment that silently confirms bookings without taking money is worse than
 * one that fails loudly.
 */

const MOCK_SECRET =
  process.env.MOCK_PAYMENT_SECRET ?? 'parkspace-development-only-mock-secret';

function sign(payload: string): string {
  return crypto.createHmac('sha256', MOCK_SECRET).update(payload).digest('hex');
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly isConfigured = true;

  constructor() {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
      throw new Error(
        'The mock payment provider is active in production. A deployment that confirms ' +
          'bookings without taking money will sell parking it cannot pay hosts for. Set ' +
          'PAYMENT_PROVIDER=razorpay with real credentials, or set ALLOW_MOCK_PAYMENTS=true ' +
          'if this is a deliberate demonstration deployment.',
      );
    }
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const providerOrderId = `mock_order_${crypto.randomBytes(10).toString('hex')}`;

    return {
      provider: 'mock',
      providerOrderId,
      amount: input.amount,
      currency: input.currency,
      clientPayload: {
        provider: 'mock',
        orderId: providerOrderId,
        amount: input.amount,
        currency: input.currency,
        bookingCode: input.bookingCode,
        // The demo checkout sheet renders these as buttons so every branch of the
        // payment flow can be exercised by hand, including the failure branch.
        outcomes: ['success', 'failure'],
      },
    };
  }

  /**
   * Produce a signed event. Used by the demo checkout sheet to call the webhook
   * the way a real gateway would, and by the test suite.
   */
  static buildSignedEvent(params: {
    eventType: 'payment.captured' | 'payment.failed';
    providerOrderId: string;
    providerPaymentId?: string;
    amount: number;
  }): { body: string; signature: string } {
    const event = {
      id: `mock_evt_${crypto.randomBytes(8).toString('hex')}`,
      event: params.eventType,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          id: params.providerPaymentId ?? `mock_pay_${crypto.randomBytes(8).toString('hex')}`,
          order_id: params.providerOrderId,
          amount: params.amount,
          currency: 'INR',
          method: 'upi',
          status: params.eventType === 'payment.captured' ? 'captured' : 'failed',
          error_code: params.eventType === 'payment.failed' ? 'MOCK_DECLINED' : null,
          error_description:
            params.eventType === 'payment.failed' ? 'Simulated decline for testing' : null,
        },
      },
    };

    const body = JSON.stringify(event);
    return { body, signature: sign(body) };
  }

  verifyWebhook(input: VerifyCallbackInput): VerifiedEvent | null {
    const provided = input.headers['x-parkspace-mock-signature'];
    if (!provided) return null;

    const expected = sign(input.rawBody);

    // Constant-time comparison. Overkill for a mock, and that is the point: the
    // production path and the development path run identical verification logic.
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      return null;
    }

    const payment = parsed?.payload?.payment;
    if (!payment) return null;

    const captured = parsed.event === 'payment.captured';

    return {
      eventId: String(parsed.id),
      eventType: String(parsed.event),
      providerOrderId: payment.order_id ?? null,
      providerPaymentId: payment.id ?? null,
      amount: typeof payment.amount === 'number' ? payment.amount : null,
      status: captured ? 'captured' : 'failed',
      method: payment.method ?? null,
      failureCode: payment.error_code ?? null,
      failureReason: payment.error_description ?? null,
      payload: parsed,
    };
  }

  verifyClientCallback(fields: Record<string, string>): boolean {
    const { order_id: orderId, payment_id: paymentId, signature } = fields;
    if (!orderId || !paymentId || !signature) return false;

    const expected = sign(`${orderId}|${paymentId}`);
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  static signClientCallback(orderId: string, paymentId: string): string {
    return sign(`${orderId}|${paymentId}`);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      providerRefundId: `mock_rfnd_${crypto.randomBytes(8).toString('hex')}`,
      status: 'completed',
      amount: input.amount,
    };
  }
}
