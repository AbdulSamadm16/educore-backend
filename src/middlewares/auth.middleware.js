const User = require('../models/user.model');
const { ApiError, asyncHandler } = require('../utils/errors');
const { verifyAccessToken } = require('../utils/tokens');
const { accessCookieName } = require('../utils/cookies');
const { inferAccountType, ROLES, isPlatformAdminRole } = require('../utils/roles');

const PLATFORM_OWNER_ROLE = ROLES.PLATFORM_OWNER;

const getBearerToken = (req) => {
  const header = req.get('authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim();
};

const verifyRequestToken = (req) => {
  const token = getBearerToken(req) || req.cookies?.[accessCookieName];

  if (!token) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  try {
    return verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Access token expired', 'ACCESS_TOKEN_EXPIRED');
    }

    throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
  }
};

const assertUserCanAccess = (user) => {
  if (!user) {
    throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
  }

  if (!user.emailVerified || user.status === 'pending_verification') {
    throw new ApiError(403, 'Email verification required', 'EMAIL_VERIFICATION_REQUIRED');
  }

  if (user.status === 'banned' || user.status === 'suspended') {
    throw new ApiError(403, 'Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }

  if (user.status === 'pending_approval' && user.role === 'tutor') {
    throw new ApiError(403, 'Your account is under review by an administrator.', 'ACCOUNT_PENDING_APPROVAL');
  }

  if (user.status !== 'active' && user.status !== 'pending_approval') {
    throw new ApiError(403, 'Account is not active', 'ACCOUNT_NOT_ACTIVE');
  }
};

const assignRequestUser = (req, user, extra = {}) => {
  req.user = {
    id: String(user._id),
    _id: user._id,
    role: user.role,
    accountType: inferAccountType(user),
    email: user.email,
    status: user.status,
    ...extra
  };
};

const authenticate = asyncHandler(async (req, _res, next) => {
  const payload = verifyRequestToken(req);

  if (!payload || payload.type !== 'access') {
    throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
  }

  const user = await User.findOne({
    _id: payload.sub,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');
  }

  assertUserCanAccess(user);

  req.user = {
    id: user._id.toString(),
    _id: user._id,
    role: user.role,
    accountType: inferAccountType(user),
    email: user.email,
    status: user.status,
    institutionId: user.institutionId || null
  };

  next();
});

const authenticateTutorApproval = asyncHandler(async (req, _res, next) => {
  const payload = verifyRequestToken(req);

  if (!payload || payload.type !== 'access') {
    throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
  }

  const user = await User.findOne({
    _id: payload.sub,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');
  }

  if (!user.emailVerified || user.status === 'pending_verification') {
    throw new ApiError(403, 'Email verification required', 'EMAIL_VERIFICATION_REQUIRED');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  if (!['pending_approval', 'rejected'].includes(user.status)) {
    throw new ApiError(403, 'Account is not eligible for tutor approval submission', 'ACCOUNT_NOT_ELIGIBLE');
  }

  req.user = {
    id: user._id.toString(),
    _id: user._id,
    role: user.role,
    accountType: inferAccountType(user),
    email: user.email,
    status: user.status,
    institutionId: user.institutionId || null
  };

  next();
});

const optionalAuthenticate = async (req, _res, next) => {
  try {
    const token = getBearerToken(req) || req.cookies?.[accessCookieName];
    if (!token) return next();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Access token expired', 'ACCESS_TOKEN_EXPIRED');
      }
      throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
    }

    if (!payload || payload.type !== 'access') {
      throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
    }

    const user = await User.findOne({
      _id: payload.sub,
      deletedAt: null
    }).lean();

    if (!user) {
      throw new ApiError(401, 'User not found', 'USER_NOT_FOUND');
    }

    assertUserCanAccess(user);

    req.user = {
      id: user._id.toString(),
      _id: user._id,
      role: user.role,
      accountType: inferAccountType(user),
      email: user.email,
      status: user.status,
      institutionId: user.institutionId || null
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return next(err);
    }
    return next();
  }
  next();
};

module.exports = authenticate;
module.exports.optionalAuthenticate = optionalAuthenticate;

const authenticatePlatformOwner = asyncHandler(async (req, _res, next) => {
  const payload = verifyRequestToken(req);

  if (payload.type !== 'access' || !isPlatformAdminRole(payload.role)) {
    throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
  }

  const user = await User.findOne({
    _id: payload.sub,
    deletedAt: null
  });

  assertUserCanAccess(user);
  if (!isPlatformAdminRole(user.role)) {
    throw new ApiError(401, 'Invalid access token', 'ACCESS_TOKEN_INVALID');
  }

  assignRequestUser(req, user, {
    isPlatformOwner: user.role === PLATFORM_OWNER_ROLE,
    isPlatformAdmin: true
  });

  next();
});

module.exports = {
  authenticate,
  optionalAuthenticate,
  authenticateTutorApproval,
  authenticatePlatformOwner
};
