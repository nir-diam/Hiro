const crypto = require('crypto');
const { Op } = require('sequelize');
const User = require('../models/User');
const Client = require('../models/Client');
const ClientContact = require('../models/ClientContact');
const emailService = require('./emailService');

const STAFF_ROLES = ['manager', 'recruiter'];

const publicAppOrigin = () =>
  String(process.env.PUBLIC_APP_URL || 'https://hiro.co.il').replace(/\/$/, '');

/**
 * Adds a `client_contacts` row for staff tied to a tenant. Skips if that email already exists for the client.
 * @returns {Promise<import('sequelize').Model|null>} new row, or null if skipped
 */
const createStaffClientContactIfNeeded = async (
  clientId,
  { name, email, role, phone, extension, useInvite, contactRoleTitle },
) => {
  if (!clientId) return null;
  const emailNorm = String(email || '').trim();
  if (!emailNorm) return null;

  const dup = await ClientContact.findOne({ where: { clientId, email: emailNorm } });
  if (dup) return null;

  const displayName = (name && String(name).trim()) || emailNorm;
  const customRole = contactRoleTitle != null ? String(contactRoleTitle).trim() : '';
  const roleLabel = customRole || (role === 'manager' ? 'מנהל/ת' : 'מגייס/ת');
  const ext = extension != null ? String(extension).trim() : '';
  const notes = ext ? `שלוחה: ${ext}` : '';
  const phoneStr = phone != null ? String(phone).trim() : '';

  return ClientContact.create({
    clientId,
    name: displayName,
    email: emailNorm,
    phone: phoneStr,
    mobilePhone: phoneStr,
    role: roleLabel,
    hasSystemAccess: true,
    isInvited: !!useInvite,
    isActive: true,
    notes,
  });
};

const sendStaffActivationEmail = async (user, activationUrl, { userRole, clientName, senderEmail }) => {
  const subject = 'הפעלת חשבון במערכת Hiro';
  const html = `<p>שלום${user.name ? ` ${user.name}` : ''},</p>
<p>הוזמנתם להצטרף למערכת Hiro. לחצו על הקישור להגדרת סיסמה:</p>
<p><a href="${activationUrl}">${activationUrl}</a></p>
<p>הקישור תקף לפעם אחת.</p>`;
  const text = `הוזמנתם להצטרף למערכת Hiro. להגדרת סיסמה: ${activationUrl}`;
  await emailService.sendEmail({
    toEmail: user.email,
    subject,
    text,
    html,
    userRole,
    clientName,
    senderEmail,
  });
};

const sendStaffPasswordResetEmail = async (user, activationUrl, { userRole, clientName, senderEmail }) => {
  const subject = 'איפוס סיסמה במערכת Hiro';
  const html = `<p>שלום${user.name ? ` ${user.name}` : ''},</p>
<p>התקבלה בקשה לאיפוס הסיסמה שלכם במערכת Hiro. לחצו על הקישור להגדרת סיסמה חדשה:</p>
<p><a href="${activationUrl}">${activationUrl}</a></p>
<p>הקישור תקף לפעם אחת. אם לא ביקשתם איפוס, התעלמו מהודעה זו.</p>`;
  const text = `לאיפוס סיסמה במערכת Hiro: ${activationUrl}`;
  await emailService.sendEmail({
    toEmail: user.email,
    subject,
    text,
    html,
    userRole,
    clientName,
    senderEmail,
  });
};

const resolveClientName = async (clientId, clientNameOverride) => {
  if (clientNameOverride) return clientNameOverride;
  if (!clientId) return null;
  const c = await Client.findByPk(clientId, { attributes: ['displayName', 'name'] });
  return c ? c.displayName || c.name || null : null;
};

/** Sets isActive=false for staff user linked to a deleted client contact. */
const deactivateStaffUserForDeletedContact = async ({ email, clientId }) => {
  const emailNorm = String(email || '').trim();
  if (!emailNorm || !clientId) return false;

  const user = await User.findOne({
    where: {
      email: emailNorm,
      clientId,
      role: { [Op.in]: STAFF_ROLES },
    },
  });
  if (!user || !user.isActive) return false;

  await user.update({ isActive: false });
  return true;
};

const reinviteInactiveStaffUser = async ({
  user,
  email,
  name,
  role,
  phone,
  extension,
  clientId,
  actor,
  clientName,
  contactRoleTitle,
}) => {
  const activationGuid = crypto.randomUUID();
  const tempPassword = crypto.randomBytes(32).toString('hex');
  const clientNameResolved = await resolveClientName(clientId, clientName);

  await user.update({
    name: name || user.name || email,
    role,
    phone: phone ?? user.phone,
    extension: extension ?? user.extension,
    clientId,
    isActive: false,
    activationGuid,
    password: tempPassword,
  });

  const contactRow = await createStaffClientContactIfNeeded(clientId, {
    name,
    email,
    role,
    phone,
    extension,
    useInvite: true,
    contactRoleTitle,
  });

  const activationUrl = `${publicAppOrigin()}/activation?guid=${activationGuid}`;
  await sendStaffActivationEmail(user, activationUrl, {
    userRole: actor?.role,
    clientName: clientNameResolved,
    senderEmail: actor?.email ? String(actor.email).trim() : null,
  });

  return { user, contactRow, inviteSent: true, reactivated: true };
};

/**
 * Creates an inactive staff user, client contact, and sends activation email.
 * @returns {Promise<{ user: import('sequelize').Model, contactRow: import('sequelize').Model|null, inviteSent: true }>}
 */
const inviteStaffUser = async ({
  email,
  name,
  role,
  phone,
  extension,
  clientId,
  actor,
  clientName: clientNameOverride,
  contactRoleTitle,
}) => {
  const emailNorm = String(email || '').trim();
  if (!emailNorm) {
    throw new Error('Email is required');
  }
  if (!STAFF_ROLES.includes(role)) {
    throw new Error('Role must be manager or recruiter');
  }
  if (!clientId) {
    throw new Error('clientId is required');
  }

  const existing = await User.findOne({ where: { email: emailNorm } });
  if (existing) {
    if (existing.isActive === true) {
      const err = new Error('User already exists and is active');
      err.code = 'EMAIL_EXISTS_ACTIVE';
      throw err;
    }
    return reinviteInactiveStaffUser({
      user: existing,
      email: emailNorm,
      name,
      role,
      phone,
      extension,
      clientId,
      actor,
      clientName: clientNameOverride,
      contactRoleTitle,
    });
  }

  const activationGuid = crypto.randomUUID();
  const tempPassword = crypto.randomBytes(32).toString('hex');
  const clientName = await resolveClientName(clientId, clientNameOverride);

  const user = await User.create({
    email: emailNorm,
    password: tempPassword,
    name: name || emailNorm,
    role,
    phone: phone || null,
    extension: extension || null,
    isActive: false,
    activationGuid,
    clientId,
  });

  let contactRow = null;
  try {
    contactRow = await createStaffClientContactIfNeeded(clientId, {
      name,
      email: emailNorm,
      role,
      phone,
      extension,
      useInvite: true,
      contactRoleTitle,
    });
  } catch (contactErr) {
    await user.destroy();
    throw contactErr;
  }

  const activationUrl = `${publicAppOrigin()}/activation?guid=${activationGuid}`;
  try {
    await sendStaffActivationEmail(user, activationUrl, {
      userRole: actor?.role,
      clientName,
      senderEmail: actor?.email ? String(actor.email).trim() : null,
    });
  } catch (sendErr) {
    await user.destroy();
    if (contactRow) await contactRow.destroy();
    throw sendErr;
  }

  return { user, contactRow, inviteSent: true };
};

/**
 * Invites the main contact of a newly created client as a manager (non-fatal on duplicate email).
 */
const provisionMainContactManager = async ({
  clientId,
  email,
  name,
  phone,
  contactRoleTitle,
  actor,
  clientName,
}) => {
  const emailNorm = String(email || '').trim();
  if (!emailNorm || !clientId) {
    return { skipped: true, reason: 'missing_fields' };
  }

  try {
    const result = await inviteStaffUser({
      email: emailNorm,
      name: name || emailNorm,
      role: 'manager',
      phone: phone || null,
      clientId,
      actor,
      clientName,
      contactRoleTitle,
    });
    return {
      ok: true,
      inviteSent: !!result.inviteSent,
      reactivated: !!result.reactivated,
      email: emailNorm,
      userId: result.user.id,
    };
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS_ACTIVE') {
      return { skipped: true, reason: 'user_active', email: emailNorm };
    }
    throw err;
  }
};

module.exports = {
  STAFF_ROLES,
  publicAppOrigin,
  createStaffClientContactIfNeeded,
  sendStaffActivationEmail,
  sendStaffPasswordResetEmail,
  deactivateStaffUserForDeletedContact,
  inviteStaffUser,
  provisionMainContactManager,
};
