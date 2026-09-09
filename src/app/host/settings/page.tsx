import { Alert, Badge, Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import {
  formatDate,
  labelFor,
  toneFor,
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_TONES,
} from '@/lib/dashboard';
import { HostProfileForm, type HostProfileValues } from './host-profile-form';

export const dynamic = 'force-dynamic';

interface HostProfileRow {
  display_name: string;
  bio: string | null;
  is_business: boolean;
  business_name: string | null;
  business_type: string | null;
  kyc_status: string;
  kyc_submitted_at: string | null;
  kyc_rejection_reason: string | null;
  is_superhost: boolean;
  created_at: string;
}

const REQUIRED_DOCUMENTS = [
  {
    title: 'Proof of identity',
    body: 'A government photo identity document for the person or the authorised signatory: Aadhaar, passport, voter card or driving licence.',
  },
  {
    title: 'Proof of address',
    body: 'Something that ties you to the property: a utility bill, a tax receipt or a rent agreement no more than three months old.',
  },
  {
    title: 'Proof you may let the space',
    body: 'Ownership papers, a society or landlord no-objection letter, or a lease that permits sub-letting the parking.',
  },
  {
    title: 'Business documents, for a business host',
    body: 'Certificate of incorporation or registration, GSTIN where you hold one, and a letter authorising the person managing the account.',
  },
];

/**
 * Host settings.
 *
 * The verification section is honest about scope: this build records a status
 * and explains what would be needed, and does not accept uploads. Pretending to
 * take an identity document and then doing nothing with it would be worse than
 * saying plainly that the feature is not here.
 */
export default async function HostSettingsPage() {
  let hostProfile: HostProfileRow | null = null;
  let fullName: string | null = null;
  let loadError: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No session');

    const [hostResult, profileResult] = await Promise.all([
      supabase
        .from('host_profiles')
        .select(
          'display_name, bio, is_business, business_name, business_type, kyc_status, kyc_submitted_at, kyc_rejection_reason, is_superhost, created_at',
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);

    hostProfile = (hostResult.data as HostProfileRow | null) ?? null;
    fullName = (profileResult.data as { full_name: string | null } | null)?.full_name ?? null;
  } catch {
    loadError =
      'We could not load your host profile. The database may be unreachable, or the migrations may not have been applied yet.';
  }

  const initial: HostProfileValues = {
    display_name: hostProfile?.display_name ?? fullName ?? '',
    bio: hostProfile?.bio ?? '',
    is_business: hostProfile?.is_business ?? false,
    business_name: hostProfile?.business_name ?? '',
    business_type: hostProfile?.business_type ?? '',
  };

  const kycStatus = hostProfile?.kyc_status ?? 'unverified';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Host settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          How you appear to drivers, and where your verification stands.
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Nothing to show">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      {!loadError && !hostProfile && (
        <Alert tone="info" title="You do not have a host profile yet">
          <p className="mt-1">
            Fill this in and save it. It is created the first time you save, and again
            automatically if you publish a listing before getting here.
          </p>
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Your public host profile</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Everything in this section is visible on your listings.
        </p>
        <div className="mt-5">
          <HostProfileForm initial={initial} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Verification</h2>
          <Badge tone={toneFor(VERIFICATION_STATUS_TONES, kycStatus)}>
            {labelFor(VERIFICATION_STATUS_LABELS, kycStatus)}
          </Badge>
        </div>

        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Verified hosts rank higher in search, and a driver handing over their car to a stranger is
          far more likely to book one. Verification also protects you: it is what lets us tell a
          genuine dispute from an attempt to claim against a space that was never yours.
        </p>

        {hostProfile?.kyc_submitted_at && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Submitted {formatDate(hostProfile.kyc_submitted_at)}.
          </p>
        )}

        {hostProfile?.kyc_rejection_reason && (
          <div className="mt-4">
            <Alert tone="danger" title="Verification was not accepted">
              <p className="mt-1">{hostProfile.kyc_rejection_reason}</p>
            </Alert>
          </div>
        )}

        <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
          What we will ask for
        </h3>
        <ul className="mt-3 space-y-3">
          {REQUIRED_DOCUMENTS.map((document) => (
            <li key={document.title} className="rounded-xl border border-[var(--border)] p-4">
              <p className="font-semibold">{document.title}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{document.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <Alert tone="warning" title="Document upload is not part of this build">
            <p className="mt-1">
              The verification workflow, the private storage bucket and the reviewer queue are
              specified but not implemented here. Nothing on this page uploads a document, and no
              identity document should be sent to this deployment by any other route either.
            </p>
          </Alert>
        </div>
      </Card>

      {hostProfile && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Hosting since</dt>
              <dd className="font-medium">{formatDate(hostProfile.created_at)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Superhost</dt>
              <dd className="font-medium">
                {hostProfile.is_superhost
                  ? 'Yes'
                  : 'Not yet. It needs a 4.7 rating across at least 10 completed stays.'}
              </dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
