import { serverEnv } from '../env';
import { MockPaymentProvider } from './mock';
import { RazorpayProvider } from './razorpay';
import type { PaymentProvider } from './types';

export * from './types';
export { MockPaymentProvider } from './mock';
export { RazorpayProvider } from './razorpay';

let cached: PaymentProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * Falls back to the mock when Razorpay is selected but has no credentials, and
 * says so loudly in the log rather than failing at the moment a user tries to
 * pay. A half-configured gateway discovered at checkout is a far worse failure
 * than one discovered at boot.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const env = serverEnv();

  if (env.PAYMENT_PROVIDER === 'razorpay') {
    const razorpay = new RazorpayProvider({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    });

    if (razorpay.isConfigured) {
      cached = razorpay;
      return cached;
    }

    console.warn(
      '[payments] PAYMENT_PROVIDER is razorpay but the credentials are missing. ' +
        'Falling back to the mock provider so the app still runs. Bookings made now ' +
        'will NOT take real money.',
    );
  }

  cached = new MockPaymentProvider();
  return cached;
}

/** Reset between tests. */
export function resetPaymentProvider(): void {
  cached = null;
}
