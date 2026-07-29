const { ApiError } = require('../utils/errors');
const { expandRoles } = require('../utils/roles');

const requireRoles = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(
      new ApiError(401, 'Authentication required', 'AUTH_REQUIRED')
    );
  }

  const userRole = req.user.role;
  const expandedRoles = expandRoles(allowedRoles);

  if (!expandedRoles.has(userRole)) {
    return next(
      new ApiError(
        403,
        `Role '${userRole}' not allowed`,
        'INSUFFICIENT_PERMISSIONS'
      )
    );
  }

  next();
};

module.exports = {
  requireRoles
};
