// Company configuration for documents and branding
// These values are used in invoices, packing slips, and other generated documents

export const COMPANY_CONFIG = {
  name: 'PsillyOps',
  
  // Warehouse address - used on packing slips and shipping documents
  warehouseAddress: {
    line1: process.env.WAREHOUSE_ADDRESS_LINE1 || '123 Business Street',
    line2: process.env.WAREHOUSE_ADDRESS_LINE2 || '',
    city: process.env.WAREHOUSE_CITY || 'City',
    state: process.env.WAREHOUSE_STATE || 'ST',
    zip: process.env.WAREHOUSE_ZIP || '12345',
  },
  
  // Formatted full address
  get formattedWarehouseAddress(): string {
    const { line1, line2, city, state, zip } = this.warehouseAddress;
    const parts = [line1];
    if (line2) parts.push(line2);
    parts.push(`${city}, ${state} ${zip}`);
    return parts.join('\n');
  },
  
  // Single line address
  get singleLineWarehouseAddress(): string {
    const { line1, line2, city, state, zip } = this.warehouseAddress;
    const parts = [line1];
    if (line2) parts.push(line2);
    parts.push(`${city}, ${state} ${zip}`);
    return parts.join(', ');
  },
};

export type CompanyConfig = typeof COMPANY_CONFIG;

