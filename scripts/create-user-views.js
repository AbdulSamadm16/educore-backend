require('dotenv').config();
const { connectMongo, mongoose } = require('../src/config/database');

const createViews = async () => {
  try {
    await connectMongo();
    console.log('Connected to database.');

    const db = mongoose.connection.db;

    // Define account types for institution
    const institutionTypes = ['institution_learner', 'institution_tutor', 'institution_admin'];

    // Create Individual View
    console.log('Creating users.individual view...');
    try {
      await db.createCollection('users.individual', {
        viewOn: 'users',
        pipeline: [
          { $match: { accountType: { $nin: institutionTypes } } }
        ]
      });
      console.log('Successfully created users.individual view.');
    } catch (err) {
      if (err.codeName === 'NamespaceExists') {
        console.log('View users.individual already exists.');
      } else {
        throw err;
      }
    }

    // Create Institution View
    console.log('Creating users.institution view...');
    try {
      await db.createCollection('users.institution', {
        viewOn: 'users',
        pipeline: [
          { $match: { accountType: { $in: institutionTypes } } }
        ]
      });
      console.log('Successfully created users.institution view.');
    } catch (err) {
      if (err.codeName === 'NamespaceExists') {
        console.log('View users.institution already exists.');
      } else {
        throw err;
      }
    }

    console.log('Views setup complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error creating views:', error);
    process.exit(1);
  }
};

createViews();
