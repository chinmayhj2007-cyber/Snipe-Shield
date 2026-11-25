import { PublicMarketplaceHome } from '@/components/marketplace/PublicMarketplaceHome';
import { fetchPublicMarketplaceHomeData } from '@/lib/marketplace/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { user, auctions, savedIds } = await fetchPublicMarketplaceHomeData();

  return (
    <PublicMarketplaceHome
      user={user}
      initialAuctions={auctions}
      initialSavedIds={savedIds}
    />
  );
}
