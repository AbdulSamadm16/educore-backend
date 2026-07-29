require('dotenv').config();
const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('async_hooks');

const tenantContext = new AsyncLocalStorage();

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const db1 = mongoose.createConnection(uri, { dbName: 'test_db1' });
const db2 = mongoose.createConnection(uri, { dbName: 'test_db2' });

const getTenantDb = () => {
  const tenant = tenantContext.getStore();
  if (tenant === 'db2') return db2;
  return db1;
};

const userSchema = new mongoose.Schema({ name: String });

db1.model('User', userSchema);
db2.model('User', userSchema);

const User = new Proxy({}, {
  get(target, prop) {
    const db = getTenantDb();
    const Model = db.model('User');
    const value = Model[prop];
    if (typeof value === 'function') {
      return value.bind(Model);
    }
    return value;
  }
});

async function run() {
  await db1.dropDatabase();
  await db2.dropDatabase();

  await tenantContext.run('db1', async () => {
    await User.create({ name: 'Alice in DB1' });
    const users = await User.find();
    console.log('DB1 Users:', users.map(u => u.name));
  });

  await tenantContext.run('db2', async () => {
    await User.create({ name: 'Bob in DB2' });
    const users = await User.find();
    console.log('DB2 Users:', users.map(u => u.name));
  });

  await db1.close();
  await db2.close();
}

run().catch(console.error);
