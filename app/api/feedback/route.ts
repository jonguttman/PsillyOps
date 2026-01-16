import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const FEEDBACK_EMAIL = 'psillyco@proton.me';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

interface FeedbackRequest {
  category: 'great_experience' | 'question' | 'issue' | 'suggestion';
  email?: string;
  message?: string;
  productName: string;
  batchCode: string;
  scanCount?: number;
  verificationDate: string;
}

// Categories that require email for follow-up
const EMAIL_REQUIRED_CATEGORIES = ['question', 'issue'];

const CATEGORY_LABELS: Record<string, string> = {
  great_experience: 'Great Experience',
  question: 'Question',
  issue: 'Issue/Problem',
  suggestion: 'Suggestion',
};

const CATEGORY_EMOJI: Record<string, string> = {
  great_experience: '🌟',
  question: '❓',
  issue: '⚠️',
  suggestion: '💡',
};

export async function POST(request: NextRequest) {
  try {
    const body: FeedbackRequest = await request.json();

    const { category, email, message, productName, batchCode, scanCount, verificationDate } = body;

    // Validate required fields
    if (!category || !productName || !batchCode) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Email is required for questions and issues
    const emailRequired = EMAIL_REQUIRED_CATEGORIES.includes(category);
    if (emailRequired && !email) {
      return NextResponse.json(
        { error: 'Email is required for questions and issues' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
    }

    const categoryLabel = CATEGORY_LABELS[category] || category;
    const categoryEmoji = CATEGORY_EMOJI[category] || '';

    const subject = `${categoryEmoji} Product Feedback: ${categoryLabel} - ${productName}`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2d5f3f 0%, #4a7d5e 100%); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${categoryEmoji} ${categoryLabel}</h1>
        </div>

        <div style="background: #fdfbf7; padding: 24px; border: 1px solid #e8e3d9; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1a1a1a; font-size: 18px; margin-top: 0;">Product Information</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 8px 0; color: #666; border-bottom: 1px solid #e8e3d9;">Product</td>
              <td style="padding: 8px 0; color: #1a1a1a; font-weight: 600; border-bottom: 1px solid #e8e3d9;">${productName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; border-bottom: 1px solid #e8e3d9;">Batch Code</td>
              <td style="padding: 8px 0; color: #1a1a1a; font-family: monospace; border-bottom: 1px solid #e8e3d9;">${batchCode}</td>
            </tr>
            ${scanCount !== undefined ? `
            <tr>
              <td style="padding: 8px 0; color: #666; border-bottom: 1px solid #e8e3d9;">Scan Count</td>
              <td style="padding: 8px 0; color: #1a1a1a; border-bottom: 1px solid #e8e3d9;">${scanCount}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #666; border-bottom: 1px solid #e8e3d9;">Verified On</td>
              <td style="padding: 8px 0; color: #1a1a1a; border-bottom: 1px solid #e8e3d9;">${verificationDate}</td>
            </tr>
          </table>

          <h2 style="color: #1a1a1a; font-size: 18px;">Customer Contact</h2>
          ${email ? `
          <p style="color: #1a1a1a; margin: 8px 0;">
            <a href="mailto:${email}" style="color: #2d5f3f;">${email}</a>
          </p>
          ` : '<p style="color: #666; font-style: italic;">No email provided</p>'}

          ${message ? `
          <h2 style="color: #1a1a1a; font-size: 18px; margin-top: 24px;">Message</h2>
          <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e8e3d9;">
            <p style="color: #1a1a1a; margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          ` : '<p style="color: #666; font-style: italic;">No additional message provided.</p>'}
        </div>

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 16px;">
          This feedback was submitted via the product verification page.
        </p>
      </div>
    `;

    const textContent = `
${categoryLabel} - Product Feedback

Product Information:
- Product: ${productName}
- Batch Code: ${batchCode}
${scanCount !== undefined ? `- Scan Count: ${scanCount}` : ''}
- Verified On: ${verificationDate}

Customer Email: ${email || 'Not provided'}

${message ? `Message:\n${message}` : 'No additional message provided.'}

---
This feedback was submitted via the product verification page.
    `.trim();

    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: 'Product Feedback <onboarding@resend.dev>',
      to: FEEDBACK_EMAIL,
      ...(email && { replyTo: email }),
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send feedback' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
