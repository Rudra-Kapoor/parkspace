import type { Paise } from '../money';

/**
 * The payment provider contract.
 *
 * Two implementations ship: a mock that needs no configuration at all, and a
 * Razorpay adapter. The mock exists so that a fresh clone can demonstrate the
 * entire booking loop, including confirmation, refunds and webhooks, without
 * anyone opening a merchant account. Swapping to a real gateway is a change to
 * one environment variable.
 *
 * The contract is written around what a marketplace actually needs, which is
 * narrower than what a gateway offers: create an intent, verify that a callback
 * really came from the provider, and refund. Everything else the gateway does is
 * deliberately not modelled.
 */

export type ProviderName = 'mock' | 'razorpay';

export interface CreateIntentInput {
  bookingId: string;
  bookingCode: string;
  amount: Paise;
  currency: string;
  /** Stable across retries of the same user intent. */
  idempotencyKey: string;
  customer: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  notes?: Record<string, string>;
}

export interface PaymentIntent {
  provider: ProviderName;
  /** The provider's order or intent identifier. */
  providerOrderId: string;
  amount: Paise;
  currency: string;
  /** Everything the browser needs to open the payment sheet. */
  clientPayload: Record<string, unknown>;
}

export interface VerifyCallbackInput {
  /** The raw body exactly as received. Signature checks run over bytes, not over a re-serialised object. */
  rawBody: string;
  headers: Record<string, string | null>;
}

export interface VerifiedEvent {
  /** The provider's own event id, used for replay protection. */
  eventId: string;
  eventType: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: Paise | null;
  status: 'authorized' | 'captured' | 'failed' | 'refunded' | 'ignored';
  method: string | null;
  failureCode: string | null;
  failureReason: string | null;
  payload: unknown;
}

export interface RefundInput {
  providerPaymentId: string;
  amount: Paise;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'processing' | 'completed' | 'failed';
  amount: Paise;
}

export interface PaymentProvider {
  readonly name: ProviderName;
  /** False when the provider has no credentials configured. */
  readonly isConfigured: boolean;

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;

  /**
   * Verify a webhook. MUST return null rather than throwing when the signature
   * does not match, so the caller can record the failed attempt and answer 400
   * without leaking whether the secret was close.
   */
  verifyWebhook(input: VerifyCallbackInput): VerifiedEvent | null;

  /** Verify a browser-side success callback, which is separate from the webhook. */
  verifyClientCallback(fields: Record<string, string>): boolean;

  refund(input: RefundInput): Promise<RefundResult>;
}
