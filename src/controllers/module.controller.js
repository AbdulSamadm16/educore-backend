const moduleService = require('../services/module.service');

const {
  asyncHandler
} = require('../utils/errors');

const {
  sendSuccess
} = require('../utils/response');

const createModule =
  asyncHandler(async (req, res) => {
    const result =
      await moduleService.createModule({
        courseId:
          req.params.courseId,

        payload: req.body,

        user: req.user
      });

    return sendSuccess(
      res,
      201,
      result.message,
      result.data
    );
  });

const updateModule =
  asyncHandler(async (req, res) => {
    const result =
      await moduleService.updateModule({
        moduleId: req.params.id,

        payload: req.body,

        user: req.user
      });

    return sendSuccess(
      res,
      200,
      result.message,
      result.data
    );
  });

const deleteModule =
  asyncHandler(async (req, res) => {
    const result =
      await moduleService.deleteModule({
        moduleId: req.params.id,

        user: req.user
      });

    return sendSuccess(
      res,
      200,
      result.message
    );
  });

  const reorderModules = asyncHandler(async (req, res) => {

  const result = await moduleService.reorderModules({
    courseId: req.body.courseId,
    orderedModuleIds: req.body.orderedModuleIds,
    user: req.user
  });

  return sendSuccess(res, 200, result.message, result.data);
});
module.exports = {
  createModule,
  updateModule,
  deleteModule,
  reorderModules
};