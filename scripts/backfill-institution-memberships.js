require('dotenv').config();
const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');
const InstitutionMembership = require('../src/models/institutionMembership.model');
const { ROLES } = require('../src/utils/roles');

(async () => {
  await connectMongo();

  const users = await User.find({
    role: { $in: [ROLES.LEARNER, ROLES.TUTOR] },
    institutionId: { $ne: null },
    deletedAt: null
  }).select('_id name email role institutionId').lean();

  const results = {
    scanned: users.length,
    created: 0,
    skipped: 0,
    failed: []
  };

  for (const user of users) {
    try {
      const result = await InstitutionMembership.updateOne(
        {
          institutionId: user.institutionId,
          userId: user._id
        },
        {
          $setOnInsert: {
            institutionId: user.institutionId,
            userId: user._id,
            memberType: user.role,
            status: 'active',
            paymentStatus: 'not_required',
            joinedAt: new Date()
          }
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        results.created += 1;
        console.log(`created membership: ${user.email} (${user.role})`);
      } else {
        results.skipped += 1;
        console.log(`existing membership: ${user.email} (${user.role})`);
      }
    } catch (error) {
      results.failed.push({
        userId: String(user._id),
        email: user.email,
        reason: error.message
      });
      console.error(`failed membership: ${user.email} - ${error.message}`);
    }
  }

  console.log(JSON.stringify(results, null, 2));
  await mongoose.connection.close();
})().catch(async (error) => {
  console.error('Error:', error.message);
  try {
    await mongoose.connection.close();
  } catch (_closeError) {
    // Ignore close errors during failure cleanup.
  }
  process.exit(1);
});
