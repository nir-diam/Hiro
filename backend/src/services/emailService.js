const EmailUpload = require('../models/EmailUpload');
const nodemailer = require('nodemailer');

const create = async (payload) => {
  const record = await EmailUpload.create(payload);
  return record;
};

const sendEmail = async ({ toEmail, subject, text, html, fromEmail }) => {
  if (!toEmail) throw new Error('Missing toEmail');
  if (!subject) throw new Error('Missing subject');

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER_NAME;
  const pass = process.env.SMTP_PASSWORD;
  const resolvedFrom =
    fromEmail || process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER_NAME;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured (SMTP_HOST/SMTP_USER_NAME/SMTP_PASSWORD missing)');
  }
  if (!resolvedFrom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resolvedFrom)) {
    throw new Error('SMTP_FROM_EMAIL must be set to a valid email address (verified SES identity)');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
  });

  return transporter.sendMail({
    from: resolvedFrom,
    to: toEmail,
    subject,
    text,
    html,
  });
};

module.exports = { create, sendEmail };

