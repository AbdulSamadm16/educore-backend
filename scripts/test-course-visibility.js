require('dotenv').config();
const mongoose = require('mongoose');
const env = require('./src/config/env');
const Course = require('./src/models/course.model');

async function verify() {
  await mongoose.connect(env.mongo.uri);
  console.log('Connected to DB');

  // Check how many courses have institutionId = null vs some ObjectId
  const totalCourses = await Course.countDocuments();
  const individualCourses = await Course.countDocuments({ institutionId: null });
  const institutionalCourses = await Course.countDocuments({ institutionId: { $ne: null } });

  console.log(`Total Courses: ${totalCourses}`);
  console.log(`Individual Courses: ${individualCourses}`);
  console.log(`Institutional Courses: ${institutionalCourses}`);

  await mongoose.disconnect();
}

verify().catch(console.error);
