'use client';

import { useRouter } from 'next/navigation';
import { MobileInventoryActions, type InventoryItemData, type LocationOption } from '@/components/mobile';

interface MobileInventoryActionsWrapperProps {
  item: InventoryItemData;
  locations: LocationOption[];
}

export default function MobileInventoryActionsWrapper({
  item,
  locations,
}: MobileInventoryActionsWrapperProps) {
  const router = useRouter();

  return (
    <MobileInventoryActions
      item={item}
      locations={locations}
      onComplete={() => {
        router.refresh();
      }}
      onCancel={() => {
        router.back();
      }}
    />
  );
}

