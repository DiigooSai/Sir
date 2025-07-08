// src/scripts/mail.service.ts
import nodemailer from 'nodemailer';

export async function sendEmailOTP(email: string, otp: string, message?: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    secure: true, // ✔️ true on port 465
    port: 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Your OTP Code',
    text: message ?? `Your OTP code is: ${otp}`,
    html: `<p>${message ? `${message}. ` : ''}Your OTP code is: <b>${otp}</b></p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('OTP email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return { success: false, error };
  }
}
