const lessonService = require('../services/lesson.service');

const { asyncHandler } = require('../utils/errors');

const { sendSuccess } = require('../utils/response');



// ======================================================
// CREATE LESSON
// ======================================================
const createLesson = asyncHandler(async (req, res) => {

  const result = await lessonService.createLesson({
    moduleId: req.params.moduleId,
    payload: req.body,
    user: req.user
  });

  return sendSuccess(
    res,
    201,
    result.message,
    result.data || null
  );
});



// ======================================================
// GET LESSON BY ID
// ======================================================
const getLessonById = asyncHandler(async (req, res) => {

  const result = await lessonService.getLessonById({
    lessonId: req.params.id,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});



// ======================================================
// UPDATE LESSON
// ======================================================
const updateLesson = asyncHandler(async (req, res) => {

  const result = await lessonService.updateLesson({
    lessonId: req.params.id,
    payload: req.body,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});



// ======================================================
// DELETE LESSON
// ======================================================
const deleteLesson = asyncHandler(async (req, res) => {

  const result = await lessonService.deleteLesson({
    lessonId: req.params.id,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});



// ======================================================
// REORDER LESSONS
// ======================================================
const reorderLessons = asyncHandler(async (req, res) => {

  const result = await lessonService.reorderLessons({
    moduleId: req.body.moduleId,
    orderedLessonIds: req.body.orderedLessonIds,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});

// ======================================================
// ADD ATTACHMENT
// ======================================================
const addAttachment = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file was provided for attachment', 'MISSING_FILE');
  }

  const result = await lessonService.addAttachment({
    lessonId: req.params.id,
    file: req.file,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});

// ======================================================
// REMOVE ATTACHMENT
// ======================================================
const removeAttachment = asyncHandler(async (req, res) => {
  const result = await lessonService.removeAttachment({
    lessonId: req.params.id,
    attachmentId: req.params.attachmentId,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});

// ======================================================
// UPLOAD SUBTITLE
// ======================================================
const uploadSubtitle = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No subtitle file was provided', 'MISSING_FILE');
  }

  const result = await lessonService.uploadSubtitle({
    lessonId: req.params.id,
    file: req.file,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});

// ======================================================
// REMOVE SUBTITLE
// ======================================================
const removeSubtitle = asyncHandler(async (req, res) => {
  const result = await lessonService.removeSubtitle({
    lessonId: req.params.id,
    user: req.user
  });

  return sendSuccess(
    res,
    200,
    result.message,
    result.data || null
  );
});

module.exports = {
  createLesson,
  getLessonById,
  updateLesson,
  deleteLesson,
  reorderLessons,
  addAttachment,
  removeAttachment,
  uploadSubtitle,
  removeSubtitle
};