require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');

const main = async () => {
  console.log('Connecting to MongoDB for backup...');
  await connectMongo();
  console.log('Connected. Fetching all users...');
  
  const users = await User.find({}).lean();
  console.log(`Fetched ${users.length} users. Writing to users-backup.json...`);
  
  const backupPath = path.join(__dirname, '../users-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(users, null, 2), 'utf8');
  console.log(`Backup completed successfully at: ${backupPath}`);
};

main()
  .catch((error) => {
    console.error('Backup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
    }
  });
