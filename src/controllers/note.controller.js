const noteService = require('../services/note.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const getNotes = asyncHandler(async (req, res) => {
  const result = await noteService.getNotes({
    userId: req.user._id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const saveNote = asyncHandler(async (req, res) => {
  const result = await noteService.saveNote({
    userId: req.user._id,
    payload: req.body
  });

  return sendSuccess(res, 201, result.message, result.data);
});

const updateNote = asyncHandler(async (req, res) => {
  const result = await noteService.updateNote({
    userId: req.user._id,
    noteId: req.params.id,
    payload: req.body
  });

  return sendSuccess(res, 200, result.message, result.data);
});

const deleteNote = asyncHandler(async (req, res) => {
  const result = await noteService.deleteNote({
    userId: req.user._id,
    noteId: req.params.id
  });

  return sendSuccess(res, 200, result.message, result.data);
});

module.exports = {
  getNotes,
  saveNote,
  updateNote,
  deleteNote
};
