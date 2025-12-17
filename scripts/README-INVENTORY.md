# Initial Inventory Setup Script

## 🎯 Purpose

This script is for **one-time initial setup** only. Use it when you need to add starting inventory quantities for materials and products that already exist in your system.

## 📋 Prerequisites

Before running this script:

1. ✅ Your **Materials** must already be created (via UI or import script)
2. ✅ Your **Products** must already be created (via UI or import script)  
3. ✅ At least one **Location** must exist in the system
4. ✅ You must know the **SKUs** of the items you want to add inventory for

## 🚀 How to Use

### Step 1: Edit the Script

Open `scripts/add-initial-inventory.ts` and find the `INVENTORY_DATA` array (around line 33).

Add your inventory items like this:

```typescript
const INVENTORY_DATA: InitialInventoryItem[] = [
  // Materials
  { type: 'MATERIAL', sku: 'MAT-PE', quantity: 500 },
  { type: 'MATERIAL', sku: 'MAT-GT', quantity: 300, lotNumber: 'LOT-001', expiryDate: '2026-12-31' },
  
  // Products
  { type: 'PRODUCT', sku: 'PROD-001', quantity: 100 },
  { type: 'PRODUCT', sku: 'PROD-002', quantity: 50, locationName: 'Warehouse A', unitCost: 12.50 },
];
```

### Step 2: Run the Script

```bash
npx tsx scripts/add-initial-inventory.ts
```

### Step 3: Verify

1. Check the console output for success/error messages
2. Go to `/ops/inventory` in your app to verify the inventory was created
3. Check material detail pages to see updated stock quantities

## 📝 Field Reference

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `type` | ✅ Yes | Either `'MATERIAL'` or `'PRODUCT'` | `'MATERIAL'` |
| `sku` | ✅ Yes | The SKU of the material or product | `'MAT-PE'` |
| `quantity` | ✅ Yes | Initial quantity on hand | `500` |
| `locationName` | ❌ No | Storage location (uses default if omitted) | `'Warehouse A'` |
| `lotNumber` | ❌ No | Lot or batch number | `'LOT-2024-001'` |
| `expiryDate` | ❌ No | Expiry date in `YYYY-MM-DD` format | `'2026-12-31'` |
| `unitCost` | ❌ No | Cost per unit | `12.50` |
| `notes` | ❌ No | Any notes about this inventory | `'Initial stock count'` |

## ⚠️ Important Notes

- **Safety**: The script will skip items that already have inventory to prevent duplicates
- **One-time use**: This is meant for initial setup only
- **Materials only**: For ongoing operations, use Purchase Orders to receive materials
- **Products**: For ongoing production, use Production Orders to create product inventory

## 🔄 Normal Operations (After Initial Setup)

After you've used this script once, you should use the proper workflows:

- **Receiving Materials**: Create Purchase Orders → Receive them
- **Making Products**: Create Production Orders → Complete them
- **Adjustments**: Use the "Adjust Inventory" button in the UI (Admin/Warehouse only)

## 🆘 Troubleshooting

**"Material with SKU 'XXX' not found"**
- Make sure the material exists and the SKU is correct
- Check in `/ops/materials` to verify

**"Inventory already exists"**
- The script won't overwrite existing inventory
- Use the "Adjust Inventory" button in the UI instead

**"No active location found"**
- Create at least one location first
- Go to Settings → Locations

## 📚 Related Scripts

- `scripts/import-materials.ts` - Import materials from CSV
- `scripts/import-products.ts` - Import products from CSV
- `scripts/create-admin.ts` - Create admin user

