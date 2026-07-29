require('dotenv').config();

const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');
const { hashPassword } = require('../src/utils/password');
const { normalizeEmail } = require('../src/utils/normalize');

async function seedPlatformOwner() {
  const name = process.env.SEED_PLATFORM_OWNER_NAME || 'Root Platform Owner';
  const email = normalizeEmail(
    process.env.SEED_PLATFORM_OWNER_EMAIL || 'owner@educore.com'
  );
  const password = process.env.SEED_PLATFORM_OWNER_PASSWORD;

  if (!password) {
    throw new Error('SEED_PLATFORM_OWNER_PASSWORD is required in .env');
  }

  console.log('Connecting to MongoDB...');
  await connectMongo();
  console.log('Connected.');

  const existingUsers = await User.find({
    email,
    deletedAt: null
  }).limit(2);

  if (existingUsers.length > 1) {
    throw new Error(`Cannot seed platform owner: email ${email} is already used by multiple active accounts`);
  }

  const existingUser = existingUsers[0] || null;

  if (existingUser) {
    if (existingUser.role !== 'platform_owner') {
      throw new Error(`Cannot seed platform owner: email ${email} is already used by another account`);
    }

    existingUser.name = name;
    existingUser.role = 'platform_owner';
    existingUser.status = 'active';
    existingUser.emailVerified = true;
    existingUser.failedLoginAttempts = 0;
    existingUser.lockUntil = null;

    if (process.env.SEED_PLATFORM_OWNER_RESET_PASSWORD === 'true') {
      existingUser.passwordHash = await hashPassword(password);
    }

    await existingUser.save();

    console.log('Existing user promoted/updated as platform_owner.');
    console.log({
      id: String(existingUser._id),
      email: existingUser.email,
      role: existingUser.role,
      status: existingUser.status
    });

    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: 'platform_owner',
    status: 'active',
    emailVerified: true
  });

  console.log('Platform owner created successfully.');
  console.log({
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status
  });
}

seedPlatformOwner()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close(false);
  });
