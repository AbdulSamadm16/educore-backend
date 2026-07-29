require('dotenv').config();

const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');
const { hashPassword } = require('../src/utils/password');
const { normalizeEmail } = require('../src/utils/normalize');

const seedUser = async ({
  name,
  email,
  password,
  role,
  resetPassword
}) => {
  const normalizedEmail = normalizeEmail(email);

  const existingUsers = await User.find({
    email: normalizedEmail,
    deletedAt: null
  }).limit(2);

  if (existingUsers.length > 1) {
    throw new Error(`Cannot seed ${role}: email ${normalizedEmail} is already used by multiple active accounts`);
  }

  const existingUser = existingUsers[0] || null;

  if (existingUser) {
    existingUser.name = name;
    existingUser.role = role;
    existingUser.status = 'active';
    existingUser.emailVerified = true;
    existingUser.failedLoginAttempts = 0;
    existingUser.lockUntil = null;

    if (resetPassword) {
      existingUser.passwordHash = await hashPassword(password);
    }

    await existingUser.save();

    console.log(`${role} updated successfully.`);
    console.log({
      id: String(existingUser._id),
      email: existingUser.email,
      role: existingUser.role,
      status: existingUser.status,
      emailVerified: existingUser.emailVerified
    });

    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role,
    status: 'active',
    emailVerified: true
  });

  console.log(`${role} created successfully.`);
  console.log({
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified
  });
};

async function seedAdmins() {
  const adminName = process.env.SEED_ADMIN_NAME || 'Admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@educore.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  const superAdminName = process.env.SEED_SUPER_ADMIN_NAME || 'Super Admin';
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@educore.com';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;

  const resetPassword = process.env.SEED_ADMINS_RESET_PASSWORD === 'true';

  if (!adminPassword) {
    throw new Error('SEED_ADMIN_PASSWORD is required in .env');
  }

  if (!superAdminPassword) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD is required in .env');
  }

  if (normalizeEmail(adminEmail) === normalizeEmail(superAdminEmail)) {
    throw new Error('Admin and super admin emails must be different');
  }

  console.log('Connecting to MongoDB...');
  await connectMongo();
  console.log('Connected.');

  await seedUser({
    name: adminName,
    email: adminEmail,
    password: adminPassword,
    role: 'admin',
    resetPassword
  });

  await seedUser({
    name: superAdminName,
    email: superAdminEmail,
    password: superAdminPassword,
    role: 'super_admin',
    resetPassword
  });

  console.log('Admin seeding completed.');
}

seedAdmins()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close(false);
  });
