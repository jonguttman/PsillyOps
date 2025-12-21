// Mobile Glass System Components
// Mobile ≠ separate app. Mobile = same system, different surface.

// Base surfaces
export { GlassCard } from './GlassCard';
export { CeramicCard } from './CeramicCard';

// Controls
export { PillButton } from './PillButton';

// Layout
export { MobileHeader } from './MobileHeader';
export { MobileBottomNav } from './MobileBottomNav';
export { MobileShell } from './MobileShell';

// Scanning
export { default as BarcodeScanner } from './BarcodeScanner';

// Flows
export { ReceivingFlow } from './ReceivingFlow';

// Screens
export { MobileDashboard } from './MobileDashboard';
export type { MobileDashboardData } from './MobileDashboard';
export { MobileMyWork } from './MobileMyWork';
export type { MobileMyWorkData, WorkItem } from './MobileMyWork';
export { MobileProductionRun } from './MobileProductionRun';
export type { ProductionRunData, ProductionStep } from './MobileProductionRun';
export { MobileInventoryActions } from './MobileInventoryActions';
export type { InventoryItemData, LocationOption } from './MobileInventoryActions';

// Confirmation & Error Surfaces
export { ConfirmationSurface } from './ConfirmationSurface';
export { ErrorSurface, NetworkErrorSurface, ValidationErrorSurface } from './ErrorSurface';

