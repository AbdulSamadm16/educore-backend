const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

// Cache the MongoDB connection across Vercel serverless invocations
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

const connectMongo = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongo.uri, {
      autoIndex: !env.isProduction,
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  console.log(`MongoDB Connected: ${cached.conn.connection.host}`);
  return cached.conn;
};

module.exports = {
  connectMongo,
  mongoose,
};