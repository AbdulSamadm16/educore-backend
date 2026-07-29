const sendSuccess = (res, statusCode, message, data = undefined) => {
  const payload = {
    success: true,
    message
  };

  if (data !== undefined) {
    payload.data = data;
  }

  return res.status(statusCode).json(payload);
};

module.exports = {
  sendSuccess
};
