const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const getRequestMeta = (req) => {
  const ip = getClientIp(req);

  return {
    ip,
    deviceInfo: {
      ip,
      userAgent: req.get('user-agent') || 'unknown'
    }
  };
};

module.exports = {
  getRequestMeta
};
