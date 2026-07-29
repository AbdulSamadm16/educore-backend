const express = require('express');
const wishlistController = require('../controllers/wishlist.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// All wishlist routes require authentication
router.use(authenticate);

router.get('/', wishlistController.getWishlist);
router.get('/status/:courseId', wishlistController.checkStatus);
router.post('/:courseId', wishlistController.addToWishlist);
router.delete('/:courseId', wishlistController.removeFromWishlist);

module.exports = router;
