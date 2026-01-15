// Company configuration for documents and branding
// These values are used in invoices, packing slips, and other generated documents

export const COMPANY_CONFIG = {
  name: 'PsillyOps',
  
  // Base URL for the application (used for QR codes, links, etc.)
  // Priority: NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost
  baseUrl: process.env.NEXT_PUBLIC_APP_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  
  // Warehouse address - used on packing slips and shipping documents
  warehouseAddress: {
    // line1: process.env.WAREHOUSE_ADDRESS_LINE1 || '123 Business Street',
    // line2: process.env.WAREHOUSE_ADDRESS_LINE2 || '',
    city: process.env.WAREHOUSE_CITY || 'Los Angeles',
    state: process.env.WAREHOUSE_STATE || 'CA',
    // zip: process.env.WAREHOUSE_ZIP || '12345',
  },
  
  // Formatted full address
  get formattedWarehouseAddress(): string {
    const { city, state } = this.warehouseAddress;
    // const parts = [line1];
    // if (line2) parts.push(line2);
    // parts.push(`${city}, ${state} ${zip}`);
    return `${city}, ${state}`;
  },
  
  // Single line address
  get singleLineWarehouseAddress(): string {
    const { city, state } = this.warehouseAddress;
    return `${city}, ${state}`;
  },
};

export type CompanyConfig = typeof COMPANY_CONFIG;

