const { ApiError } = require('../utils/errors');

const validate = (schemaMap) => (req, _res, next) => {
  try {
    for (const [segment, schema] of Object.entries(schemaMap)) {
      const { value, error } = schema.validate(req[segment], {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        throw new ApiError(
          400,
          'Validation failed',
          'VALIDATION_ERROR',
          error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        );
      }

      req[segment] = value;
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = validate;
