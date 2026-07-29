require('dotenv').config();
const { connectMongo, mongoose } = require('../src/config/database');
const User = require('../src/models/user.model');
const Institution = require('../src/models/institution.model');
const Batch = require('../src/models/batch.model');
const Course = require('../src/models/course.model');
const Enrollment = require('../src/models/enrollment.model');
const LiveSession = require('../src/models/liveSession.model');

async function run() {
  console.log('Connecting to database...');
  await connectMongo();
  console.log('Connected.');

  // 1. Find the institutional admin
  const adminEmail = 'nouriensha2@gmail.com';
  const admin = await User.findOne({ email: adminEmail, deletedAt: null });
  if (!admin) {
    console.error(`Admin user ${adminEmail} not found!`);
    process.exit(1);
  }
  console.log(`Found admin: ${admin.name} (ID: ${admin._id})`);

  // 2. Find or create an institution
  let institution = await Institution.findOne({ domain: 'educore.edu' });
  if (!institution) {
    console.log('Creating new institution...');
    institution = await Institution.create({
      name: 'EduCore Institute of Technology',
      domain: 'educore.edu',
      email: 'contact@educore.edu',
      description: 'Prestige institution for computing research and digital learning.',
      status: 'active',
      owner: admin._id
    });
    console.log(`Created institution: ${institution.name} (ID: ${institution._id})`);
  } else {
    console.log(`Found existing institution: ${institution.name} (ID: ${institution._id})`);
  }

  // 3. Link the admin to this institution
  admin.institutionId = institution._id;
  await admin.save();
  console.log(`Linked admin ${admin.email} to institution ${institution.name}`);

  // Link the super admin as well
  const superAdminEmail = 'nourienshanasar@gmail.com';
  const superAdmin = await User.findOne({ email: superAdminEmail, deletedAt: null });
  if (superAdmin) {
    superAdmin.institutionId = institution._id;
    await superAdmin.save();
    console.log(`Linked super admin ${superAdmin.email} to institution ${institution.name}`);
  }

  // 4. Find tutors and link them to the institution
  const tutors = await User.find({ role: 'tutor', deletedAt: null }).limit(3);
  if (tutors.length === 0) {
    console.log('No tutors found.');
  } else {
    for (const tutor of tutors) {
      tutor.institutionId = institution._id;
      tutor.status = 'active';
      await tutor.save();
      console.log(`Linked tutor: ${tutor.name} (${tutor.email}) to institution`);
    }
  }

  // 5. Find learners and link them to the institution
  const learners = await User.find({ role: 'learner', deletedAt: null }).limit(10);
  if (learners.length === 0) {
    console.log('No learners found.');
  } else {
    for (const learner of learners) {
      learner.institutionId = institution._id;
      learner.status = 'active';
      await learner.save();
      console.log(`Linked learner: ${learner.name} (${learner.email}) to institution`);
    }
  }

  // 6. Find or create a course
  let course = await Course.findOne({ deletedAt: null });
  if (!course) {
    console.log('Creating a mock course...');
    course = await Course.create({
      title: 'Advanced React Architecture and Performance',
      shortDescription: 'Master modern frontend development.',
      description: 'Detailed React engineering course.',
      category: 'Development',
      level: 'Advanced',
      price: 99.99,
      isFree: false,
      authorId: tutors[0]?._id || admin._id,
      status: 'published'
    });
    console.log(`Created course: ${course.title}`);
  } else {
    console.log(`Found course: ${course.title} (ID: ${course._id})`);
  }

  // 7. Create mock enrollments with completion progress stats
  await Enrollment.deleteMany({ userId: { $in: learners.map(l => l._id) } });
  console.log('Cleared existing enrollments...');
  
  let i = 0;
  for (const learner of learners) {
    const progress = 40 + (i * 5); 
    await Enrollment.create({
      userId: learner._id,
      courseId: course._id,
      progressPercentage: progress,
      enrolledAt: new Date(Date.now() - (i * 24 * 3600 * 1000)),
      status: 'active',
      enrollmentType: 'free'
    });
    console.log(`Enrolled learner: ${learner.name} with progress ${progress}%`);
    i++;
  }

  // 8. Find or create a batch
  await Batch.deleteMany({ institutionId: institution._id });
  console.log('Cleared existing batches...');

  const batch = await Batch.create({
    institutionId: institution._id,
    name: 'CS-2026-A',
    startDate: new Date(),
    endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    assignedTutorId: tutors[0]?._id || null,
    status: 'active',
    students: learners.map(learner => ({
      userId: learner._id,
      addedBy: admin._id,
      addedAt: new Date()
    }))
  });
  console.log(`Created batch: ${batch.name} with ${batch.students.length} students`);

  // 9. Create upcoming live sessions for the batch
  await LiveSession.deleteMany({ batchId: batch._id });
  console.log('Cleared existing sessions...');

  const session = await LiveSession.create({
    title: 'CS-2026-A: React State Management Deep Dive',
    description: 'Weekly review of state strategies, context optimization, and performance profiling.',
    startTime: new Date(Date.now() + 2 * 3600 * 1000), // 2 hours from now
    endTime: new Date(Date.now() + 3 * 3600 * 1000),
    status: 'scheduled',
    meetingUrl: 'https://meet.google.com/vjg-hksx-nrm',
    batchId: batch._id,
    courseId: course._id,
    tutorId: tutors[0]?._id || admin._id,
    timezone: 'Asia/Kolkata',
    durationMinutes: 60
  });
  console.log(`Created upcoming live session: ${session.title}`);

  console.log('Database seeded and linked successfully!');
  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
