const express = require('express');
const noteController = require('../controllers/note.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', noteController.getNotes);
router.post('/', noteController.saveNote);
router.put('/:id', noteController.updateNote);
router.delete('/:id', noteController.deleteNote);

module.exports = router;
