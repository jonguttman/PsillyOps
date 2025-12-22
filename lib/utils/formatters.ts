// Formatting utilities for display

import { format } from 'date-fns';

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return format(new Date(date), 'MMM d, yyyy h:mm a');
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

export function formatNumber(num: number | null | undefined, decimals: number = 0): string {
  if (num === null || num === undefined) return '-';
  return num.toFixed(decimals);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function truncate(str: string, length: number = 50): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function generateOrderNumber(prefix: string = 'ORD'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export function generateBatchCode(productSku: string, date: Date = new Date()): string {
  const dateStr = format(date, 'yyyy-MM-dd');
  const random = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `${productSku}-${dateStr}-${random}`;
}







