import { Alert, Card, EmptyState } from '@/components/ui';
import { requireAdmin } from '@/lib/admin';
import { formatDateTime } from '@/lib/dashboard';
import { SettingsForm, type SettingRow } from './settings-form';

export const dynamic = 'force-dynamic';

/**
 * Plain-language consequences.
 *
 * The `description` column says what a setting is. This says what happens when
 * you change it, which is the thing somebody about to change it actually needs
 * to know, and it is the difference between an informed decision and a guess.
 */
const EFFECTS: Record<string, string> = {
  HOST_COMMISSION_PCT:
    'Applies to bookings made from the moment you save. Existing bookings keep the rate frozen onto them, so last month is never restated.',
  DRIVER_SERVICE_FEE_PCT:
    'Raises what the driver pays without changing what the host earns. It is the most visible price change a driver will notice.',
  GST_PCT:
    'A placeholder tax rate on platform fees. It must be settled with a chartered accountant before real money moves.',
  BOOKING_HOLD_MINUTES:
    'How long a bay is held while somebody pays. Longer means fewer lost payments and more inventory locked behind abandoned checkouts.',
  GRACE_PERIOD_MINUTES:
    'Free overstay allowance. Shorter collects more overstay revenue and produces more angry drivers who were four minutes late.',
  MIN_BOOKING_MINUTES: 'The global floor on a stay. A host may set a higher floor, never a lower one.',
  MAX_BOOKING_DAYS: 'The global ceiling on a single booking. Monthly inventory sits near this limit.',
  OVERSTAY_MULTIPLIER:
    'Applied to the hourly rate for time past the grace period. It is a deterrent, and pricing it as pure revenue is how a marketplace loses drivers.',
  REFERRAL_REWARD_PAISE:
    'Paid to each side once the referred account completes a booking. It comes out of platform margin, not the host share.',
  SEARCH_DEFAULT_RADIUS_M: 'The radius a search uses when the driver has not chosen one.',
  SEARCH_MAX_RADIUS_M: 'The hard ceiling on a search radius. Raising it makes every search more expensive.',
  REVIEW_WINDOW_DAYS:
    'How long an unpaired review stays hidden before it publishes on its own. This is the anti-retaliation window.',
  SUPERHOST_MIN_RATING: 'Rating floor for the Superhost badge.',
  SUPERHOST_MIN_BOOKINGS: 'Completed stays required for the Superhost badge.',
  PAYOUT_DELAY_HOURS:
    'How long after checkout a booking becomes payable. It is the window in which a dispute can still be raised, so shortening it means paying out money you may have to claw back.',
  MAX_EXTENSIONS: 'How many times one booking may be extended.',
};

interface SettingsRowFromDb {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string | null;
}

/**
 * Platform settings.
 *
 * Every value here is read by the booking engine at quote time, so this page is
 * the business rule engine surface. Nothing is hardcoded in the application
 * that belongs here, and nothing here needs a deploy to change.
 */
export default async function AdminSettingsPage() {
  let settings: SettingRow[] = [];
  let canEdit = false;
  let lastUpdated: string | null = null;
  let loadError: string | null = null;

  try {
    const gate = await requireAdmin(['admin', 'support']);
    if (!gate.ok) throw new Error('Not authorised');
    canEdit = gate.context.role === 'admin';

    const { data, error } = await gate.context.service
      .from('platform_settings')
      .select('key, value, description, updated_at')
      .order('key');

    if (error) throw new Error(error.message);

    const rows = (data as SettingsRowFromDb[] | null) ?? [];
    settings = rows.map((row) => ({
      key: row.key,
      // jsonb comes back parsed. Serialising it back keeps the editor honest
      // about what is stored: "0.1" is a string and 0.1 is a number, and the
      // accessors in the database cast differently for each.
      value: typeof row.value === 'string' ? JSON.stringify(row.value) : JSON.stringify(row.value),
      description: row.description,
      updated_at: row.updated_at,
      effect: EFFECTS[row.key] ?? 'Read by the booking engine at quote time.',
    }));

    for (const row of rows) {
      if (row.updated_at && (!lastUpdated || row.updated_at > lastUpdated)) {
        lastUpdated = row.updated_at;
      }
    }
  } catch {
    loadError =
      'We could not load platform settings. Check that SUPABASE_SERVICE_ROLE_KEY is set and that the migrations have been applied.';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Platform settings</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Commission, fees, hold duration and grace period. These are configuration, not code, and
          changing one takes effect on the next quote.
          {lastUpdated && <> Last changed {formatDateTime(lastUpdated)}.</>}
        </p>
      </header>

      {loadError && (
        <Alert tone="warning" title="Settings unavailable">
          <p className="mt-1">{loadError}</p>
        </Alert>
      )}

      <Alert tone="warning" title="Every change here is a pricing decision">
        <p className="mt-1">
          Values are stored as JSON. A number must be written as a number: 0.1 rather than "0.1",
          and 10 rather than "10". Each save writes an audit row showing the value before and after,
          who changed it and when.
        </p>
      </Alert>

      {!loadError && settings.length === 0 ? (
        <EmptyState
          title="No settings found"
          description="The platform_settings table is seeded by migration 0005. If it is empty, the migrations have not been applied."
        />
      ) : (
        <Card className="p-5 sm:p-6">
          <SettingsForm settings={settings} canEdit={canEdit} />
        </Card>
      )}
    </div>
  );
}
