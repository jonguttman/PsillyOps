import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { createProductionOrder } from '@/lib/services/productionService';

async function handleCreate(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const productId = formData.get('productId') as string;
  const quantityToMake = parseInt(formData.get('quantityToMake') as string);
  const batchSize = formData.get('batchSize') ? parseFloat(formData.get('batchSize') as string) : undefined;
  const scheduledDate = formData.get('scheduledDate') ? new Date(formData.get('scheduledDate') as string) : undefined;
  const dueDate = formData.get('dueDate') ? new Date(formData.get('dueDate') as string) : undefined;
  const workCenterId = formData.get('workCenterId') as string || undefined;
  const templateId = formData.get('templateId') as string || undefined;

  const orderId = await createProductionOrder({
    productId,
    quantityToMake,
    batchSize,
    scheduledDate,
    dueDate,
    workCenterId,
    templateId,
    userId: session.user.id
  });

  revalidatePath('/production');
  redirect(`/production/${orderId}`);
}

export default async function NewProductionOrderPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const [products, workCenters, templates] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: {
        bom: {
          where: { active: true },
          select: { id: true }
        }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.workCenter.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    }),
    prisma.productionTemplate.findMany({
      where: { active: true },
      include: {
        product: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    })
  ]);

  // Only show products with BOM
  const productsWithBOM = products.filter(p => p.bom.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Production Order</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create a new production order with material requirements
          </p>
        </div>
        <Link
          href="/production"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          &larr; Back
        </Link>
      </div>

      {/* Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <form action={handleCreate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Product *</label>
              <select
                name="productId"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">Select a product...</option>
                {productsWithBOM.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
              {products.length > 0 && productsWithBOM.length === 0 && (
                <p className="mt-1 text-xs text-red-500">
                  No products have a BOM configured. Please add BOM items to products first.
                </p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Quantity to Make *</label>
              <input
                type="number"
                name="quantityToMake"
                required
                min="1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="e.g., 100"
              />
            </div>

            {/* Batch Size (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Batch Size (optional)</label>
              <input
                type="number"
                name="batchSize"
                min="1"
                step="0.01"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Default from product/template"
              />
              <p className="mt-1 text-xs text-gray-500">Leave blank to use product or template default</p>
            </div>

            {/* Template (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Production Template (optional)</label>
              <select
                name="templateId"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">None</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.product.name} (batch: {template.defaultBatchSize})
                  </option>
                ))}
              </select>
            </div>

            {/* Scheduled Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Scheduled Date</label>
              <input
                type="date"
                name="scheduledDate"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Due Date</label>
              <input
                type="date"
                name="dueDate"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            {/* Work Center (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Work Center (optional)</label>
              <select
                name="workCenterId"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">None</option>
                {workCenters.map(wc => (
                  <option key={wc.id} value={wc.id}>
                    {wc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900">What happens next?</h4>
            <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
              <li>Material requirements will be calculated from the product&apos;s BOM</li>
              <li>The system will check available inventory and flag shortages</li>
              <li>You can then start the order and issue materials</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link
              href="/production"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Production Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
