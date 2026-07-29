const institutionFeeService = require('../services/institutionFee.service');

const getPublicFeePlan = async (req, res, next) => {
  try {
    const feePlan = await institutionFeeService.getPublicFeePlan(req.params.institutionId);
    if (!feePlan) {
      return res.status(404).json({ success: false, message: 'Fee plan not found' });
    }
    res.status(200).json({ success: true, message: 'Fee plan retrieved', data: feePlan });
  } catch (err) {
    next(err);
  }
};

const getFeePlanHistory = async (req, res, next) => {
  try {
    const result = await institutionFeeService.getFeePlanHistory({
      actor: req.user,
      institutionId: req.params.institutionId
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const createFeePlanVersion = async (req, res, next) => {
  try {
    const result = await institutionFeeService.createFeePlanVersion({
      actor: req.user,
      institutionId: req.params.institutionId,
      ...req.body
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const togglePaymentRequirement = async (req, res, next) => {
  try {
    const result = await institutionFeeService.togglePaymentRequirement({
      actor: req.user,
      institutionId: req.params.institutionId,
      ...req.body
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPublicFeePlan,
  getFeePlanHistory,
  createFeePlanVersion,
  togglePaymentRequirement
};
