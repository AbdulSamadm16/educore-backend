require('dotenv').config();

const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');

const auditDuplicateEmails = async () => {
  console.log('Connecting to MongoDB...');
  await connectMongo();
  console.log('Connected.');

  const duplicates = await User.aggregate([
    {
      $match: {
        deletedAt: null
      }
    },
    {
      $group: {
        _id: '$email',
        count: {
          $sum: 1
        },
        accounts: {
          $push: {
            id: '$_id',
            role: '$role',
            status: '$status',
            emailVerified: '$emailVerified'
          }
        }
      }
    },
    {
      $match: {
        count: {
          $gt: 1
        }
      }
    },
    {
      $sort: {
        count: -1,
        _id: 1
      }
    }
  ]);

  if (duplicates.length === 0) {
    console.log('No duplicate active emails found.');
    return;
  }

  console.log(`Found ${duplicates.length} duplicate email group(s):`);
  console.log(JSON.stringify(duplicates, null, 2));
};

auditDuplicateEmails()
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close(false);
  });
