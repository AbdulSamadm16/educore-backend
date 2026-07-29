const wishlistService = require('../services/wishlist.service');
const { asyncHandler } = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

const addToWishlist = asyncHandler(async (req, res) => {
  const result = await wishlistService.addToWishlist({
    userId: req.user.id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 201, 'Course added to wishlist', result);
});

const removeFromWishlist = asyncHandler(async (req, res) => {
  await wishlistService.removeFromWishlist({
    userId: req.user.id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 200, 'Course removed from wishlist');
});

const getWishlist = asyncHandler(async (req, res) => {
  const result = await wishlistService.getWishlist({
    userId: req.user.id
  });

  return sendSuccess(res, 200, 'Wishlist retrieved successfully', result);
});

const checkStatus = asyncHandler(async (req, res) => {
  const result = await wishlistService.checkStatus({
    userId: req.user.id,
    courseId: req.params.courseId
  });

  return sendSuccess(res, 200, 'Wishlist status checked', result);
});

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  checkStatus
};
