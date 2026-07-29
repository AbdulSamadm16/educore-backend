const eventEmitter = require('../utils/eventEmitter');
const InstitutionMembership = require('../models/institutionMembership.model');
const InstitutionFeePlan = require('../models/institutionFeePlan.model');
const auditService = require('../services/audit.service');
const emailService = require('../services/email.service');
const Institution = require('../models/institution.model');
const { ACCOUNT_TYPES, ROLES } = require('../utils/roles');

eventEmitter.on('user.verified', async ({ user, regData, requestMeta }) => {
  try {
    // 1. Log Self-Registration Audit Action
    await auditService.logAdminAction({
      actorUserId: user._id,
      targetUserId: user._id,
      action: 'SELF_REGISTER',
      metadata: {
        registrationType: regData.registrationType,
        role: user.role,
        institutionId: regData.institutionId || null
      },
      requestMeta
    });
  } catch (error) {
    console.error('[Auth Subscriber] Self-registration audit log failed:', error.message);
  }

  try {
    // 2. Handle Institution Membership based on registrationType
    if (regData.registrationType === ACCOUNT_TYPES.INSTITUTION_LEARNER) {
      const feePlan = await InstitutionFeePlan.findOne({ institutionId: regData.institutionId, active: true }).lean();
      const paymentRequired = feePlan ? feePlan.paymentRequired : false;

      if (paymentRequired) {
        return;
      }

      await InstitutionMembership.updateOne(
        { institutionId: regData.institutionId, userId: user._id },
        {
          $set: {
            memberType: 'learner',
            status: 'active',
            paymentStatus: 'not_required'
          },
          $setOnInsert: {
            joinedAt: new Date()
          }
        },
        { upsert: true }
      );
    } else if (regData.registrationType === ACCOUNT_TYPES.INSTITUTION_TUTOR) {
      await InstitutionMembership.updateOne(
        { institutionId: regData.institutionId, userId: user._id },
        {
          $set: {
            memberType: 'tutor',
            status: 'pending_approval', // Enforced membership approval state
            paymentStatus: 'not_required'
          },
          $setOnInsert: {
            joinedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error('[Auth Subscriber] Institution membership creation failed:', error.message);
  }

  // 3. Handle Tutor Notifications
  if (user.role === ROLES.TUTOR) {
    try {
      await emailService.sendTutorApprovalRequestEmail({
        tutorName: user.name,
        tutorEmail: user.email
      });

      if (regData.registrationType === ACCOUNT_TYPES.INDIVIDUAL_TUTOR) {
        const notificationService = require('../services/notification.service');
        await notificationService.triggerTutorRegistrationAlert({
          tutorId: user._id.toString()
        });
      } else if (regData.registrationType === ACCOUNT_TYPES.INSTITUTION_TUTOR) {
        const inst = await Institution.findById(regData.institutionId).select('owner').lean();
        if (inst && inst.owner) {
          const notificationService = require('../services/notification.service');
          await notificationService.createNotification({
            userId: inst.owner.toString(),
            title: 'Institution Tutor Registration',
            message: `Tutor "${user.name}" has registered for your institution and is pending approval.`,
            type: 'system',
            metadata: { tutorId: user._id.toString() }
          });
        }
      }
    } catch (error) {
      console.error('[Auth Subscriber] Tutor registration notifications failed:', error.message);
    }
  }
});
