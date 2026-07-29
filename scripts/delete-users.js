require('dotenv').config();
const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');

const deleteUsers = async () => {
  try {
    await connectMongo();
    console.log('Connected to database.');

    const result = await User.deleteMany({
      role: { $in: ['learner', 'tutor'] }
    });

    console.log(`Successfully deleted ${result.deletedCount} learner and tutor accounts.`);
    
    // Also log the remaining users to ensure seeded users are intact
    const remaining = await User.find({}).select('email role').lean();
    console.log('Remaining accounts:');
    console.table(remaining);

    process.exit(0);
  } catch (error) {
    console.error('Error deleting users:', error);
    process.exit(1);
  }
};

deleteUsers();
