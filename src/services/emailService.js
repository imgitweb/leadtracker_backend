import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

let transporter = null;

export const getMailTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || user === 'your_email@gmail.com') {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
};

/**
 * 1. Send OTP Verification Email in Cinfy's Emerald Theme
 */
export const sendVerificationOtpEmail = async ({ email, otp, fullName = 'User' }) => {
  const transport = getMailTransporter();
  if (!transport) {
    console.warn('⚠️ SMTP not configured. OTP printed in console:', otp);
    return false;
  }

  const senderEmail = process.env.SMTP_USER || 'cinfyco@gmail.com';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code - Cinfy</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);">
          <!-- Top Header Brand -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%); padding: 32px 36px; text-align: left;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; font-family: 'Segoe UI', sans-serif;">
                      cinfy<span style="color: #34d399;">.co</span>
                    </div>
                    <div style="color: #a7f3d0; font-size: 12px; font-weight: 600; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase;">
                      All Your Business Solutions in One Place
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); color: #ffffff; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 20px;">
                      🔒 SECURE OTP
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                Verify Your Account
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                Hello <strong>${fullName}</strong>, thank you for signing up with Cinfy! Use the verification code below to verify your email address and activate your <strong>15-day free trial</strong>:
              </p>

              <!-- OTP Box -->
              <div style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 2px dashed #10b981; border-radius: 14px; padding: 24px 20px; text-align: center; margin: 24px 0 28px 0;">
                <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">
                  Your 6-Digit Verification Code
                </div>
                <div style="font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #065f46; margin: 4px 0;">
                  ${otp}
                </div>
                <div style="font-size: 11px; color: #059669; margin-top: 6px; font-weight: 600;">
                  ⏱️ Valid for 30 minutes
                </div>
              </div>

              <!-- Security Tips -->
              <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
                <tr>
                  <td style="font-size: 12px; color: #64748b; line-height: 1.5;">
                    🛡️ <strong>Security Tip:</strong> Never share this code with anyone. Cinfy representatives will never ask for your verification code. If you did not request this, please ignore this email.
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: #0f172a;">The Cinfy Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 36px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; color: #94a3b8;">
                © ${new Date().getFullYear()} Cinfy Solutions. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Need help? Contact us at <a href="mailto:cinfyco@gmail.com" style="color: #059669; text-decoration: none; font-weight: 600;">cinfyco@gmail.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const info = await transport.sendMail({
      from: `"Cinfy.co" <${senderEmail}>`,
      to: email,
      subject: `${otp} is your Cinfy verification code`,
      html,
    });
    console.log(`✅ [EmailService] Verification OTP sent to ${email} (MessageID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ [EmailService] Failed to send OTP email to ${email}:`, err.message);
    return false;
  }
};

/**
 * 2. Send Welcome & Signup Confirmation Email in Cinfy's Emerald Theme
 */
export const sendWelcomeEmail = async ({
  email,
  fullName = 'Valued Partner',
  companyName = 'Your Business Workspace',
  solutions = [],
  trialDays = 15,
  loginUrl = 'http://localhost:5173/login',
}) => {
  const transport = getMailTransporter();
  if (!transport) return false;

  const senderEmail = process.env.SMTP_USER || 'cinfyco@gmail.com';

  const solutionLabels = {
    crm: 'CRM & Lead Automation',
    whatsapp: 'WhatsApp Business Solution',
    calling: 'AI Voice Calling Agent',
    calling_agent: 'AI Voice Calling Agent',
    website: 'Website & E-commerce',
    digital_marketing: 'Digital Marketing & Ads',
    seo: 'SEO & Organic Growth',
    custom_software: 'Custom Software Development',
    email: 'Bulk Email Automation',
  };

  const formattedSolutions = solutions.map((s) => solutionLabels[s] || s);

  const solutionsHtml = formattedSolutions.length > 0
    ? formattedSolutions
        .map(
          (name) => `
          <div style="display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; margin: 3px;">
            ✓ ${name}
          </div>`
        )
        .join('')
    : `<div style="display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px;">
        ✓ CRM & Growth Platform
      </div>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Cinfy</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
          <!-- Top Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%); padding: 36px 40px; text-align: left;">
              <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 28px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">
                      cinfy<span style="color: #34d399;">.co</span>
                    </div>
                    <div style="color: #a7f3d0; font-size: 13px; font-weight: 600; margin-top: 4px;">
                      Welcome Aboard! 🎉
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background: #10b981; color: #ffffff; font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 20px; text-transform: uppercase;">
                      ${trialDays}-DAY TRIAL ACTIVE
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 40px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #0f172a;">
                Welcome, ${fullName}!
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                Your Cinfy workspace has been successfully created. We are excited to partner with you and help scale your business with automated lead tracking, WhatsApp messaging, and AI calling.
              </p>

              <!-- Account Summary Card -->
              <table width="100%" cellspacing="0" cellpadding="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;"><strong>Business Workspace:</strong></td>
                  <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${companyName}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;"><strong>Registered Email:</strong></td>
                  <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${email}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; font-size: 13px; color: #64748b;"><strong>Free Trial Period:</strong></td>
                  <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #047857;">${trialDays} Days Full Access</td>
                </tr>
              </table>

              <!-- Selected Solutions -->
              <div style="margin-bottom: 28px;">
                <div style="font-size: 12px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
                  Your Selected Solutions:
                </div>
                <div>${solutionsHtml}</div>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0 24px 0;">
                <a href="${loginUrl}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);">
                  Open Your Dashboard →
                </a>
              </div>

              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                Need onboarding help or custom setup? Simply reply to this email or reach us on WhatsApp anytime.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} Cinfy Solutions. Empowering Indian Businesses.
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                <a href="https://cinfy.co" style="color: #059669; text-decoration: none; font-weight: 600;">cinfy.co</a> • <a href="mailto:cinfyco@gmail.com" style="color: #059669; text-decoration: none; font-weight: 600;">cinfyco@gmail.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const info = await transport.sendMail({
      from: `"Cinfy.co" <${senderEmail}>`,
      to: email,
      subject: `🎉 Welcome to Cinfy, ${fullName}! Your ${trialDays}-Day Free Trial is Active`,
      html,
    });
    console.log(`✅ [EmailService] Welcome email sent to ${email} (MessageID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ [EmailService] Failed to send welcome email to ${email}:`, err.message);
    return false;
  }
};

export default {
  sendVerificationOtpEmail,
  sendWelcomeEmail,
  getMailTransporter,
};

