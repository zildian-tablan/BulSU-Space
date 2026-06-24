export interface MessagingPrincipal {
  id?: string | null;
  role?: string | null;
  office?: string | null;
  offices?: string[] | null;
}

const normalize = (value?: string | null): string =>
  (typeof value === 'string' ? value.trim().toLowerCase() : '');

export const normalizeUserRole = (role?: string | null): string => normalize(role).replace(/_/g, ' ');

export const isSuperAdminRole = (role?: string | null): boolean => {
  return normalizeUserRole(role) === 'super admin';
};

export const isSuperAdminUser = (user?: MessagingPrincipal | null): boolean => {
  return isSuperAdminRole(user?.role);
};

export const hasAdminOffice = (user: MessagingPrincipal | null | undefined, officeName: string): boolean => {
  if (!user || normalizeUserRole(user.role) !== 'admin') return false;

  const targetOffice = normalize(officeName);
  const office = normalize(user.office);
  if (office === targetOffice) return true;

  if (Array.isArray(user.offices)) {
    return user.offices.some((entry) => normalize(entry) === targetOffice);
  }

  return false;
};

export const isAdminRegistrarOrProgramChair = (user: MessagingPrincipal | null | undefined): boolean => {
  return hasAdminOffice(user, 'registrar') || hasAdminOffice(user, 'program chair');
};

export const canSendDirectMessage = (
  sender: MessagingPrincipal | null | undefined,
  recipient: MessagingPrincipal | null | undefined
): boolean => {
  if (!sender || !recipient) return false;

  const senderId = sender.id || '';
  const recipientId = recipient.id || '';
  if (senderId && recipientId && senderId === recipientId) return false;

  if (isSuperAdminUser(sender)) return true;
  if (isSuperAdminUser(recipient)) return false;

  return true;
};

export const canStartDirectChat = canSendDirectMessage;
