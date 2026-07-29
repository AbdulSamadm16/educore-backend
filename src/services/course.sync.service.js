const Course = require('../models/course.model');
const Module = require('../models/module.model');
const Lesson = require('../models/lesson.model');

const recalculateCourseStructure = async (courseId) => {

  const modules = await Module.find({
    courseId,
    deletedAt: null
  });

  const lessons = await Lesson.find({
    courseId,
    deletedAt: null
  });

  const totalModules = modules.length;
  const totalLessons = lessons.length;

  const totalDuration = lessons.reduce(
    (sum, l) => sum + (l.durationInMinutes || 0),
    0
  );

  await Course.updateOne(
    { _id: courseId },
    {
      totalModules,
      totalLessons,
      durationInMinutes: totalDuration
    }
  );
};

module.exports = {
  recalculateCourseStructure
};