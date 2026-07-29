const mongoose = require('mongoose');
const InstitutionFeePlan = require('../models/institutionFeePlan.model');
const Institution = require('../models/institution.model');
const auditService = require('./audit.service');
const { ApiError } = require('../utils/errors');
const { isInstitutionAdminRole, isPlatformAdminRole } = require('../utils/roles');

const runInTransaction = async (fn) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (_) {
    session = null;
  }
  try {
    const result = await fn(session);
    if (session) await session.commitTransaction();
    return result;
  } catch (err) {
    if (session && session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    if (session) session.endSession();
  }
};

const validateAdminContext = async (actor, institutionId) => {
  if (isPlatformAdminRole(actor.role)) return true;
  if (isInstitutionAdminRole(actor.role) && String(actor.institutionId) === String(institutionId)) {
    return true;
  }
  throw new ApiError(403, 'Unauthorized to manage fees for this institution', 'UNAUTHORIZED_FEE_ACCESS');
};

const getPublicFeePlan = async (institutionId) => {
  const feePlan = await InstitutionFeePlan.findOne({ institutionId, active: true }).lean();
  if (!feePlan) return null;

  return {
    registrationFee: feePlan.registrationFee,
    joiningFee: feePlan.joiningFee,
    monthlyFee: feePlan.monthlyFee,
    paymentRequired: feePlan.paymentRequired,
    currency: feePlan.currency
  };
};

const getFeePlanHistory = async ({ actor, institutionId }) => {
  await validateAdminContext(actor, institutionId);

  const history = await InstitutionFeePlan.find({ institutionId })
    .sort({ version: -1 })
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .lean();

  return {
    message: 'Fee plan history retrieved',
    data: history
  };
};

const createFeePlanVersion = async ({ actor, institutionId, registrationFee, joiningFee, monthlyFee, changeReason }) => {
  await validateAdminContext(actor, institutionId);

  const inst = await Institution.findById(institutionId);
  if (!inst) throw new ApiError(404, 'Institution not found', 'INST_NOT_FOUND');
  if (inst.status === 'suspended') throw new ApiError(403, 'Institution is suspended', 'INST_SUSPENDED');

  return await runInTransaction(async (session) => {
    const activePlan = await InstitutionFeePlan.findOne({ institutionId, active: true }).session(session);

    let nextVersion = 1;
    let paymentRequired = false;
    let currency = 'INR';

    if (activePlan) {
      nextVersion = activePlan.version + 1;
      paymentRequired = activePlan.paymentRequired;
      currency = activePlan.currency;

      activePlan.active = false;
      activePlan.effectiveTo = new Date();
      activePlan.updatedBy = actor._id;
      await activePlan.save({ session });

      await auditService.logAdminAction({
        actorUserId: actor._id,
        targetUserId: actor._id,
        action: 'FEE_PLAN_DEACTIVATED',
        metadata: { institutionId, feePlanId: activePlan._id, version: activePlan.version }
      });
    }

    const newPlan = new InstitutionFeePlan({
      institutionId,
      registrationFee,
      joiningFee,
      monthlyFee,
      paymentRequired,
      currency,
      active: true,
      version: nextVersion,
      effectiveFrom: new Date(),
      createdBy: actor._id,
      updatedBy: actor._id,
      changeReason
    });

    await newPlan.save({ session });

    await auditService.logAdminAction({
      actorUserId: actor._id,
      targetUserId: actor._id,
      action: activePlan ? 'FEE_PLAN_UPDATED' : 'FEE_PLAN_CREATED',
      metadata: { 
        institutionId, 
        feePlanId: newPlan._id, 
        version: newPlan.version,
        oldValues: activePlan ? {
          registrationFee: activePlan.registrationFee,
          joiningFee: activePlan.joiningFee,
          monthlyFee: activePlan.monthlyFee
        } : null,
        newValues: { registrationFee, joiningFee, monthlyFee },
        reason: changeReason
      }
    });

    return {
      message: 'New fee plan version created and activated',
      data: newPlan
    };
  });
};

const togglePaymentRequirement = async ({ actor, institutionId, paymentRequired, changeReason }) => {
  await validateAdminContext(actor, institutionId);

  const inst = await Institution.findById(institutionId);
  if (!inst) throw new ApiError(404, 'Institution not found', 'INST_NOT_FOUND');
  if (inst.status === 'suspended') throw new ApiError(403, 'Institution is suspended', 'INST_SUSPENDED');

  return await runInTransaction(async (session) => {
    const activePlan = await InstitutionFeePlan.findOne({ institutionId, active: true }).session(session);
    if (!activePlan) {
      throw new ApiError(404, 'No active fee plan found. Create a fee plan first.', 'FEE_PLAN_MISSING');
    }

    if (activePlan.paymentRequired === paymentRequired) {
      return { message: 'Payment requirement is already set to requested state', data: activePlan };
    }

    const oldStatus = activePlan.paymentRequired;
    activePlan.paymentRequired = paymentRequired;
    activePlan.updatedBy = actor._id;
    activePlan.changeReason = changeReason;
    await activePlan.save({ session });

    await auditService.logAdminAction({
      actorUserId: actor._id,
      targetUserId: actor._id,
      action: 'PAYMENT_REQUIREMENT_CHANGED',
      metadata: { 
        institutionId, 
        feePlanId: activePlan._id,
        version: activePlan.version,
        oldValues: { paymentRequired: oldStatus },
        newValues: { paymentRequired },
        reason: changeReason
      }
    });

    return {
      message: 'Payment requirement updated successfully',
      data: activePlan
    };
  });
};

module.exports = {
  getPublicFeePlan,
  getFeePlanHistory,
  createFeePlanVersion,
  togglePaymentRequirement
};
