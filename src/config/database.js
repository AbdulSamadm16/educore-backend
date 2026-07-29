const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

const connectMongo = async () => {
  try {
    const conn = await mongoose.connect(env.mongo.uri, {
      autoIndex: !env.isProduction,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = {
  connectMongo,
  mongoose
};
