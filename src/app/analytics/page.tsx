import { AuctionAnalyticsClient } from '@/components/marketplace/AuctionAnalyticsClient';
import { requireAuthenticatedUser } from '@/lib/marketplace/server';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const { user } = await requireAuthenticatedUser();
  return <AuctionAnalyticsClient user={user} />;
}
