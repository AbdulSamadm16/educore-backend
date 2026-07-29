require('dotenv').config();

const { connectMongo, mongoose } = require('../../config/database');
const User = require('../../models/user.model');
const Institution = require('../../models/institution.model');

async function migrate() {
  console.log('Connecting to MongoDB...');
  await connectMongo();
  console.log('Connected.');

  // Find default active institution
  const defaultInstitution = await Institution.findOne({ status: 'active' });
  if (!defaultInstitution) {
    console.warn('Warning: No active institution found. Migration aborted.');
    return;
  }

  console.log(`Using default active institution: ${defaultInstitution.name} (${defaultInstitution._id})`);

  const result = await User.updateMany(
    { role: 'tutor', institutionId: null },
    { $set: { institutionId: defaultInstitution._id } }
  );

  console.log(`Backfilled ${result.modifiedCount || 0} tutor(s) with institutionId: ${defaultInstitution._id}`);
}

migrate()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      console.log('Database connection closed.');
    }
  });
