require('dotenv').config();
const { connectMongo, mongoose } = require('../src/config/database');
const Submission = require('../src/models/submission.model');
const QuizAttempt = require('../src/models/quizAttempt.model');

const clearGradeCenter = async () => {
  try {
    await connectMongo();
    console.log('Connected to database.');

    const subResult = await Submission.deleteMany({});
    const quizResult = await QuizAttempt.deleteMany({});

    console.log(`Successfully deleted ${subResult.deletedCount} submissions.`);
    console.log(`Successfully deleted ${quizResult.deletedCount} quiz attempts.`);
    
    // Log the remaining counts to ensure they are 0
    const remainingSubs = await Submission.countDocuments();
    const remainingQuizzes = await QuizAttempt.countDocuments();
    console.log('Remaining Submissions:', remainingSubs);
    console.log('Remaining Quiz Attempts:', remainingQuizzes);

    process.exit(0);
  } catch (error) {
    console.error('Error clearing grade center:', error);
    process.exit(1);
  }
};

clearGradeCenter();
