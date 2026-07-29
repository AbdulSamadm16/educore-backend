require('dotenv').config();
const { connectMongo, mongoose } = require('../src/config/database');

(async () => {
  await connectMongo();
  const db = mongoose.connection.db;

  const result = await db.collection('institutions').updateMany(
    {},
    { $set: { isPublished: true, acceptsEnrollments: true } }
  );

  console.log('Updated institution count:', result.modifiedCount);

  // Verify
  const institutions = await db.collection('institutions').find({}).toArray();
  institutions.forEach(inst => {
    console.log(`- ${inst.name} | status=${inst.status} | isPublished=${inst.isPublished} | acceptsEnrollments=${inst.acceptsEnrollments}`);
  });

  await mongoose.connection.close();
  console.log('Done!');
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
