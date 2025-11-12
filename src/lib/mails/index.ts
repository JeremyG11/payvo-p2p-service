import nodemailer from "nodemailer";
import { config } from "@/config/env";
import { renderEmailTemplate } from "./renderTemplate";
import SMTPTransport from "nodemailer/lib/smtp-transport";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  family: 4, // Use IPv4
} as SMTPTransport.Options);

export const sendTwoFactorTokenEmail = async (email: string, token: string) => {
  try {
    const mailOptions = {
      from: '"psp me 👻 <no-reply ></no-reply> "',
      to: email,
      subject: "2FA Code",
      html: `<p>Your 2FA code: ${token}</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`2FA code sent to ${email}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Failed to send 2FA code to ${email}: ${error.message}`);
    } else {
      console.error(`Failed to send 2FA code to ${email}: ${error}`);
    }
    throw error;
  }
};

/**
 * Send a password reset email with an OTP or confirmation link.
 * @param email - The recipient's email address
 * @param token - A verification token for the password reset link
 */

export const sendPasswordResetEmailWithOTP = async (
  email: string,
  token: string,
  OTP: string
) => {
  try {
    const resetLink = `${config.domain}/auth/reset-password?token=${token}`;
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: "Reset your password",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`,
    };

    await transporter.sendMail(mailOptions);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(
        `Failed to send password reset email to ${email}: ${error.message}`
      );
    } else {
      console.error(
        `Failed to send password reset email to ${email}: ${error}`
      );
    }
    throw error;
  }
};

/**
 * Send a verification email with an OTP or confirmation link.
 * @param email - The recipient's email address
 * @param token - A verification token for the email confirmation link
 * @param OTP - The OTP to display in the email
 */

export const sendVerificationEmailOTP = async (
  email: string,
  name: string,
  OTP: string
) => {
  try {
    // Render the email template
    const html = await renderEmailTemplate("OTP-Verification.html", {
      OTP,
      name,
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: "Confirm your email",
      html,
    };

    const result = await transporter.sendMail(mailOptions);

    console.log(result);
    console.log(`Verification email sent to ${email}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(
        `Failed to send verification email to ${email}: ${error.message}`
      );
    } else {
      console.error(`Failed to send verification email to ${email}:`, error);
    }
    throw error;
  }
};
