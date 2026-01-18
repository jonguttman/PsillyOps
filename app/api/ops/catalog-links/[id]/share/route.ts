/**
 * POST /api/ops/catalog-links/[id]/share
 *
 * Send catalog link via email to retailer
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getCatalogLink, buildCatalogUrl } from '@/lib/services/catalogLinkService';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

const shareSchema = z.object({
  recipientEmail: z.string().email('Invalid email address'),
  recipientName: z.string().max(200).optional(),
  customMessage: z.string().max(1000).optional()
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get catalog link
    const catalogLink = await getCatalogLink(id);
    if (!catalogLink) {
      return NextResponse.json({ error: 'Catalog link not found' }, { status: 404 });
    }

    // Parse and validate body
    const body = await req.json();
    const { recipientEmail, recipientName, customMessage } = shareSchema.parse(body);

    // Build catalog URL
    const catalogUrl = buildCatalogUrl(catalogLink.token);
    const displayName = catalogLink.displayName || catalogLink.retailer.name;
    const senderName = session.user.name || 'Your Sales Representative';

    // Build email content
    const subject = `Your Product Catalog is Ready - ${displayName}`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Your Product Catalog</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">Prepared exclusively for ${displayName}</p>
        </div>

        <div style="padding: 32px;">
          ${recipientName ? `<p style="color: #1a1a1a; font-size: 16px; margin: 0 0 16px 0;">Hi ${recipientName},</p>` : ''}

          ${customMessage ? `
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #4f46e5;">
            <p style="color: #475569; margin: 0; white-space: pre-wrap;">${customMessage}</p>
          </div>
          ` : `
          <p style="color: #475569; font-size: 16px; margin: 0 0 24px 0;">
            I've prepared a personalized product catalog for you. Browse our selection and add items to your cart to request a quote or samples.
          </p>
          `}

          <div style="text-align: center; margin: 32px 0;">
            <a href="${catalogUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View Your Catalog
            </a>
          </div>

          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin-top: 24px;">
            <p style="color: #64748b; font-size: 14px; margin: 0;">
              <strong>What you can do:</strong>
            </p>
            <ul style="color: #64748b; font-size: 14px; margin: 8px 0 0 0; padding-left: 20px;">
              <li>Browse our complete product selection</li>
              <li>Add products to your cart for a quote</li>
              <li>Request samples with just a few clicks</li>
              <li>Download a PDF catalog for offline viewing</li>
            </ul>
          </div>

          ${catalogLink.expiresAt ? `
          <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0 0; text-align: center;">
            This catalog link expires on ${new Date(catalogLink.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
          ` : ''}
        </div>

        <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #64748b; font-size: 14px; margin: 0;">
            Questions? Reply to this email to reach ${senderName}.
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0 0;">
            &copy; ${new Date().getFullYear()} PsillyOps. All prices are wholesale.
          </p>
        </div>
      </div>
    `;

    const textContent = `
Your Product Catalog is Ready

${recipientName ? `Hi ${recipientName},` : ''}

${customMessage || "I've prepared a personalized product catalog for you. Browse our selection and add items to your cart to request a quote or samples."}

View your catalog: ${catalogUrl}

What you can do:
- Browse our complete product selection
- Add products to your cart for a quote
- Request samples with just a few clicks
- Download a PDF catalog for offline viewing

${catalogLink.expiresAt ? `This catalog link expires on ${new Date(catalogLink.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` : ''}

Questions? Reply to this email to reach ${senderName}.

---
${new Date().getFullYear()} PsillyOps. All prices are wholesale.
    `.trim();

    // Send email
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: 'PsillyOps Catalog <catalog@originalpsilly.com>',
      to: recipientEmail,
      replyTo: session.user.email || undefined,
      subject,
      html: htmlContent,
      text: textContent
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    // Log the share
    await logAction({
      entityType: ActivityEntity.CATALOG_LINK,
      entityId: id,
      action: 'catalog_link_shared',
      userId: session.user.id,
      summary: `Catalog shared via email to ${recipientEmail}`,
      metadata: {
        token: catalogLink.token,
        recipientEmail,
        recipientName,
        hasCustomMessage: !!customMessage
      },
      tags: ['catalog', 'share', 'email']
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Share API error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
