// Order Action Constants
// Shared between backend API routes and frontend components

export const ORDER_ACTIONS = {
  SUBMIT: 'submit',
  APPROVE: 'approve',
  SHIP: 'ship',
  CANCEL: 'cancel',
  MARK_REVIEWED: 'mark_reviewed',
} as const;

export type OrderAction = typeof ORDER_ACTIONS[keyof typeof ORDER_ACTIONS];

// Action display names for UI
export const ORDER_ACTION_LABELS: Record<OrderAction, string> = {
  [ORDER_ACTIONS.SUBMIT]: 'Submit',
  [ORDER_ACTIONS.APPROVE]: 'Approve',
  [ORDER_ACTIONS.SHIP]: 'Ship',
  [ORDER_ACTIONS.CANCEL]: 'Cancel',
  [ORDER_ACTIONS.MARK_REVIEWED]: 'Mark as Reviewed',
};

// Action button colors
export const ORDER_ACTION_COLORS: Record<OrderAction, string> = {
  [ORDER_ACTIONS.SUBMIT]: 'amber',
  [ORDER_ACTIONS.APPROVE]: 'blue',
  [ORDER_ACTIONS.SHIP]: 'green',
  [ORDER_ACTIONS.CANCEL]: 'red',
  [ORDER_ACTIONS.MARK_REVIEWED]: 'purple',
};

