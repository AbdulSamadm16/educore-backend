const bcrypt = require('bcrypt');
const env = require('../config/env');

const hashPassword = async (password) => bcrypt.hash(password, env.security.bcryptSaltRounds);

const comparePassword = async (password, passwordHash) => bcrypt.compare(password, passwordHash);

module.exports = {
  hashPassword,
  comparePassword
};
