import type { ComponentType } from 'react';

declare global {
  var HotspotActivePage: ComponentType<{ session: string }>;
}

export {};
