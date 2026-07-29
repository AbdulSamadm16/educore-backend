require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { dbIndividual, dbInstitution } = require('../src/config/database');

const restoreUsers = async () => {
  console.log('Reading users backup...');
  const backupPath = path.join(__dirname, '../users-backup.json');
  if (!fs.existsSync(backupPath)) {
    console.error('No backup found at', backupPath);
    process.exit(1);
  }

  const users = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log(`Found ${users.length} users in backup.`);

  const individualUsers = [];
  const institutionUsers = [];

  for (const user of users) {
    // Determine target based on accountType or role
    const isInstitution = ['institution_learner', 'institution_tutor', 'institution_admin'].includes(user.accountType);
    
    // In Mongoose, we need to convert string dates back to Date objects if inserting raw, but 
    // since we use db.collection.insertMany we can just pass the JSON.
    // Actually, Date strings are fine for MongoDB if we use the Model, but if we use collection we should map them.
    if (user.createdAt) user.createdAt = new Date(user.createdAt);
    if (user.updatedAt) user.updatedAt = new Date(user.updatedAt);
    if (user.lockUntil) user.lockUntil = new Date(user.lockUntil);
    if (user.deletedAt) user.deletedAt = new Date(user.deletedAt);
    // Convert _id to ObjectId
    const { ObjectId } = require('mongodb');
    if (user._id && user._id.$oid) {
       user._id = new ObjectId(user._id.$oid);
    } else if (typeof user._id === 'string') {
       user._id = new ObjectId(user._id);
    }

    if (isInstitution) {
      institutionUsers.push(user);
    } else {
      individualUsers.push(user);
    }
  }

  console.log(`Found ${individualUsers.length} individual users and ${institutionUsers.length} institution users.`);

  // Insert into Individual DB
  if (individualUsers.length > 0) {
    const indUserCollection = dbIndividual.collection('users');
    await indUserCollection.deleteMany({}); // clear existing
    await indUserCollection.insertMany(individualUsers);
    console.log('Inserted individual users.');
  }

  // Insert into Institution DB
  if (institutionUsers.length > 0) {
    const instUserCollection = dbInstitution.collection('users');
    await instUserCollection.deleteMany({}); // clear existing
    await instUserCollection.insertMany(institutionUsers);
    console.log('Inserted institution users.');
  }

  console.log('Restore complete!');
  process.exit(0);
};

restoreUsers().catch(console.error);
