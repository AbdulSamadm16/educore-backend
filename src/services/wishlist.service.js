const Wishlist = require('../models/wishlist.model');
const Course = require('../models/course.model');
const { ApiError } = require('../utils/errors');

const addToWishlist = async ({ userId, courseId }) => {
  // Check if course exists
  const course = await Course.findById(courseId);
  if (!course) {
    throw new ApiError(404, 'Course not found', 'COURSE_NOT_FOUND');
  }

  // Check if already in wishlist
  const existing = await Wishlist.findOne({ userId, courseId });
  if (existing) {
    throw new ApiError(400, 'Course already in wishlist', 'WISHLIST_ALREADY_EXISTS');
  }

  const wishlistItem = await Wishlist.create({ userId, courseId });
  return wishlistItem;
};

const removeFromWishlist = async ({ userId, courseId }) => {
  const result = await Wishlist.findOneAndDelete({ userId, courseId });
  if (!result) {
    throw new ApiError(404, 'Wishlist item not found', 'WISHLIST_NOT_FOUND');
  }
  return result;
};

const getWishlist = async ({ userId }) => {
  const wishlist = await Wishlist.find({ userId })
    .populate('courseId')
    .sort({ createdAt: -1 });
  
  return wishlist.map(item => item.courseId).filter(Boolean);
};

const checkStatus = async ({ userId, courseId }) => {
  const existing = await Wishlist.findOne({ userId, courseId });
  return { inWishlist: !!existing };
};

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  checkStatus
};
