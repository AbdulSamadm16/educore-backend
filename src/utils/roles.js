const ROLES = Object.freeze({
  LEARNER: 'learner',
  TUTOR: 'tutor',
  INSTITUTION_ADMIN: 'institution_admin',
  PLATFORM_ADMIN: 'platform_admin',
  SUPER_ADMIN: 'super_admin',
  PLATFORM_OWNER: 'platform_owner',
  LEGACY_ADMIN: 'admin'
});

const ACCOUNT_TYPES = Object.freeze({
  INDIVIDUAL_LEARNER: 'individual_learner',
  INDIVIDUAL_TUTOR: 'individual_tutor',
  INSTITUTION_LEARNER: 'institution_learner',
  INSTITUTION_TUTOR: 'institution_tutor',
  INSTITUTION_ADMIN: 'institution_admin',
  PLATFORM_ADMIN: 'platform_admin'
});

const USER_ROLES = [
  ROLES.LEARNER,
  ROLES.TUTOR,
  ROLES.INSTITUTION_ADMIN,
  ROLES.PLATFORM_ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.PLATFORM_OWNER,
  ROLES.LEGACY_ADMIN
];

const PUBLIC_REGISTRATION_TYPES = [
  ACCOUNT_TYPES.INDIVIDUAL_LEARNER,
  ACCOUNT_TYPES.INDIVIDUAL_TUTOR,
  ACCOUNT_TYPES.INSTITUTION_LEARNER,
  ACCOUNT_TYPES.INSTITUTION_TUTOR
];

const ADMIN_ROLES = [
  ROLES.INSTITUTION_ADMIN,
  ROLES.PLATFORM_ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.PLATFORM_OWNER,
  ROLES.LEGACY_ADMIN
];

const PLATFORM_ADMIN_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.PLATFORM_OWNER
];

const INSTITUTION_ADMIN_ROLES = [
  ROLES.INSTITUTION_ADMIN,
  ROLES.LEGACY_ADMIN
];

const ROLE_ALIASES = Object.freeze({
  admin: [ROLES.LEGACY_ADMIN, ROLES.INSTITUTION_ADMIN],
  super_admin: [ROLES.SUPER_ADMIN, ROLES.PLATFORM_ADMIN, ROLES.PLATFORM_OWNER],
  institution_admin: [ROLES.INSTITUTION_ADMIN, ROLES.LEGACY_ADMIN],
  platform_admin: [ROLES.PLATFORM_ADMIN, ROLES.SUPER_ADMIN, ROLES.PLATFORM_OWNER]
});

const expandRoles = (roles) => {
  const expanded = new Set();
  roles.forEach((role) => {
    expanded.add(role);
    (ROLE_ALIASES[role] || []).forEach((alias) => expanded.add(alias));
  });
  return expanded;
};

const isPlatformAdminRole = (role) => PLATFORM_ADMIN_ROLES.includes(role);
const isInstitutionAdminRole = (role) => INSTITUTION_ADMIN_ROLES.includes(role);
const isAdminRole = (role) => ADMIN_ROLES.includes(role);

const inferAccountType = (user) => {
  if (user.accountType) return user.accountType;

  if (user.role === ROLES.LEARNER) {
    return user.institutionId ? ACCOUNT_TYPES.INSTITUTION_LEARNER : ACCOUNT_TYPES.INDIVIDUAL_LEARNER;
  }

  if (user.role === ROLES.TUTOR) {
    return user.institutionId ? ACCOUNT_TYPES.INSTITUTION_TUTOR : ACCOUNT_TYPES.INDIVIDUAL_TUTOR;
  }

  if (isInstitutionAdminRole(user.role)) return ACCOUNT_TYPES.INSTITUTION_ADMIN;
  if (isPlatformAdminRole(user.role)) return ACCOUNT_TYPES.PLATFORM_ADMIN;

  return null;
};

module.exports = {
  ROLES,
  ACCOUNT_TYPES,
  USER_ROLES,
  PUBLIC_REGISTRATION_TYPES,
  ADMIN_ROLES,
  PLATFORM_ADMIN_ROLES,
  INSTITUTION_ADMIN_ROLES,
  expandRoles,
  isPlatformAdminRole,
  isInstitutionAdminRole,
  isAdminRole,
  inferAccountType
};
