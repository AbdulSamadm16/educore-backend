const Note = require('../models/note.model');
const { ApiError } = require('../utils/errors');

const getNotes = async ({ userId }) => {
  const notes = await Note.find({ userId, deletedAt: null })
    .populate('lessonId', 'title')
    .populate('courseId', 'title')
    .sort({ updatedAt: -1 });

  return {
    message: 'Notes retrieved successfully',
    data: notes
  };
};

const saveNote = async ({ userId, payload }) => {
  const note = await Note.create({
    userId,
    ...payload
  });

  return {
    message: 'Note saved successfully',
    data: note
  };
};

const updateNote = async ({ userId, noteId, payload }) => {
  const note = await Note.findOneAndUpdate(
    { _id: noteId, userId, deletedAt: null },
    { $set: { content: payload.content } },
    { new: true }
  );

  if (!note) {
    throw new ApiError(404, 'Note not found');
  }

  return {
    message: 'Note updated successfully',
    data: note
  };
};

const deleteNote = async ({ userId, noteId }) => {
  const note = await Note.findOneAndUpdate(
    { _id: noteId, userId, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );

  if (!note) {
    throw new ApiError(404, 'Note not found');
  }

  return {
    message: 'Note deleted successfully'
  };
};

module.exports = {
  getNotes,
  saveNote,
  updateNote,
  deleteNote
};
