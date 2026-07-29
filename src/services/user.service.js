const User = require('../models/user.model');
const InstitutionMembership = require('../models/institutionMembership.model');
const AuditLog = require('../models/auditLog.model');
const { ApiError } = require('../utils/errors');
const { normalizeEmail } = require('../utils/normalize');
const { hashPassword, comparePassword } = require('../utils/password');
const { toPublicUser } = require('../utils/userPresenter');
const otpService = require('./otp.service');
const emailService = require('./email.service');
const muxService = require('./mux.service');
const {
  uploadAvatar,
  uploadTutorCredential,
  uploadTutorSampleVideo,
  deleteResource
} = require('./storage.service');
const { revokeAllUserSessions, revokeOtherUserSessions } = require('./session.service');

const ensureTutorApprovalProfile = (user) => {
  if (!user.profile) {
    user.profile = {};
  }

  if (!user.profile.tutorApproval) {
    user.profile.tutorApproval = {
      expertise: [],
      credentials: [],
      sampleVideo: {}
    };
  }

  if (!Array.isArray(user.profile.tutorApproval.credentials)) {
    user.profile.tutorApproval.credentials = [];
  }

  if (!user.profile.tutorApproval.sampleVideo) {
    user.profile.tutorApproval.sampleVideo = {};
  }

  return user.profile.tutorApproval;
};

const hydrateTutorRejectionReason = async (user, tutorApproval) => {
  if (user.status !== 'rejected' || tutorApproval.rejectionReason) {
    return tutorApproval;
  }

  const rejectionLog = await AuditLog.findOne({
    targetUserId: user._id,
    action: 'REJECT_TUTOR',
    'metadata.reason': { $exists: true, $ne: '' }
  })
    .sort({ createdAt: -1 })
    .lean();

  const reason = rejectionLog?.metadata?.reason || '';
  if (reason) {
    tutorApproval.rejectionReason = reason;
  }

  return tutorApproval;
};

const getProfile = async ({ userId }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  }).select('+googleRefreshToken');

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  return {
    message: 'Profile retrieved successfully.',
    data: {
      user: toPublicUser(user)
    }
  };
};

const requestEmailChange = async ({ userId, email, currentPassword }) => {
  const newEmail = normalizeEmail(email);
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  }).select('+passwordHash');

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const matches = await comparePassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw new ApiError(400, 'Current password is incorrect', 'CURRENT_PASSWORD_INVALID');
  }

  if (user.email === newEmail) {
    return {
      requiresVerification: false,
      email: newEmail
    };
  }

  const duplicate = await User.exists({
    _id: {
      $ne: userId
    },
    email: newEmail,
    deletedAt: null
  });

  if (duplicate) {
    throw new ApiError(409, 'Email is already registered', 'EMAIL_ALREADY_EXISTS');
  }

  await otpService.enforceResendCooldown({
    userId,
    purpose: otpService.PURPOSES.EMAIL_CHANGE
  });

  const otp = await otpService.createOtp({
    userId,
    purpose: otpService.PURPOSES.EMAIL_CHANGE,
    metadata: {
      newEmail
    }
  });

  await emailService.sendEmailChangeOtp({
    to: newEmail,
    otp,
    name: user.name
  });

  return {
    requiresVerification: true,
    email: newEmail
  };
};

const updateProfile = async ({ userId, payload, file }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  }).select('+googleRefreshToken');

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const $set = {};

  if (payload.name !== undefined) {
    $set.name = payload.name;
  }

  if (payload.bio !== undefined) {
    $set['profile.bio'] = payload.bio;
  }

  if (file) {
    $set['profile.avatarUrl'] = await uploadAvatar({
      userId,
      file
    });
  }

  const updatedUser = Object.keys($set).length > 0
    ? await User.findOneAndUpdate(
        {
          _id: userId,
          deletedAt: null
        },
        {
          $set
        },
        {
          new: true,
          runValidators: true,
          select: '+googleRefreshToken'
        }
      )
    : user;

  return {
    message: 'Profile updated successfully.',
    data: {
      user: toPublicUser(updatedUser)
    }
  };
};

const getTutorApprovalProfile = async ({ userId }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = await hydrateTutorRejectionReason(user, ensureTutorApprovalProfile(user));

  return {
    message: 'Tutor approval profile retrieved successfully.',
    data: {
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const updateTutorApprovalProfile = async ({ userId, payload }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = ensureTutorApprovalProfile(user);

  if (payload.bio !== undefined) {
    user.profile.bio = payload.bio;
  }

  if (payload.expertise !== undefined) {
    tutorApproval.expertise = payload.expertise;
  }

  user.markModified('profile');
  await user.save();

  return {
    message: 'Tutor approval profile updated successfully.',
    data: {
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const addTutorCredential = async ({ userId, file, files }) => {
  const filesToUpload = Array.isArray(files) && files.length > 0 ? files : (file ? [file] : []);

  if (filesToUpload.length === 0) {
    throw new ApiError(400, 'No Aadhaar file uploaded', 'MISSING_FILE');
  }

  if (filesToUpload.length > 1) {
    throw new ApiError(400, 'Only one Aadhaar file can be uploaded', 'CREDENTIAL_LIMIT_EXCEEDED');
  }

  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = ensureTutorApprovalProfile(user);
  const credentials = tutorApproval.credentials || [];
  if (credentials.length > 0) {
    throw new ApiError(400, 'Only one Aadhaar file can be uploaded', 'CREDENTIAL_LIMIT_EXCEEDED');
  }

  const uploadedCredentials = await Promise.all(
    filesToUpload.map((credentialFile) => uploadTutorCredential({ userId, file: credentialFile }))
  );

  const uploadedAt = new Date();
  uploadedCredentials.forEach((credential) => tutorApproval.credentials.push({
    ...credential,
    uploadedAt
  }));

  user.markModified('profile');
  await user.save();

  return {
    message: 'Aadhaar uploaded successfully.',
    data: {
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const removeTutorCredential = async ({ userId, credentialId }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = ensureTutorApprovalProfile(user);
  const credential = tutorApproval.credentials.id(credentialId);
  if (!credential) {
    throw new ApiError(404, 'Aadhaar file not found', 'CREDENTIAL_NOT_FOUND');
  }

  if (credential.publicId) {
    await deleteResource({
      publicId: credential.publicId,
      resourceType: credential.resourceType || 'raw'
    });
  }

  tutorApproval.credentials.pull(credentialId);
  user.markModified('profile');
  await user.save();

  return {
    message: 'Aadhaar removed successfully.',
    data: {
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const uploadTutorSample = async ({ userId, file }) => {
  if (!file) {
    throw new ApiError(400, 'No sample video uploaded', 'MISSING_FILE');
  }

  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = ensureTutorApprovalProfile(user);
  const previous = tutorApproval.sampleVideo;
  const sampleVideo = await uploadTutorSampleVideo({ userId, file });

  tutorApproval.sampleVideo = {
    ...sampleVideo,
    uploadedAt: new Date()
  };

  user.markModified('profile');
  await user.save();

  if (previous?.publicId) {
    await deleteResource({
      publicId: previous.publicId,
      resourceType: previous.resourceType || 'video'
    }).catch((error) => {
      console.error('Failed to delete previous tutor sample video:', error);
    });
  }

  return {
    message: 'Sample video uploaded successfully.',
    data: {
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const initTutorSampleVideoMuxUpload = async ({ userId, payload }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = ensureTutorApprovalProfile(user);
  const upload = await muxService.createDirectUpload();

  tutorApproval.sampleVideo = {
    title: payload.fileName || 'Sample Video',
    videoUrl: null,
    publicId: null,
    resourceType: 'mux',
    muxUploadId: upload.id,
    muxAssetId: null,
    muxPlaybackId: null,
    videoStatus: 'uploading',
    mimeType: payload.mimeType || null,
    size: payload.fileSize || 0,
    uploadedAt: null
  };

  user.markModified('profile');
  await user.save();

  return {
    message: 'Mux sample video upload initialized.',
    data: {
      uploadUrl: upload.url,
      uploadId: upload.id,
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const getTutorSampleVideoMuxStatus = async ({ userId, uploadId }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const tutorApproval = ensureTutorApprovalProfile(user);
  const sampleVideo = tutorApproval.sampleVideo || {};

  if (sampleVideo.muxUploadId && sampleVideo.muxUploadId !== uploadId) {
    throw new ApiError(403, 'Upload session does not belong to this tutor application', 'MUX_UPLOAD_FORBIDDEN');
  }

  const upload = await muxService.getUploadStatus(uploadId);
  const responseData = {
    status: upload.status,
    assetId: upload.asset_id || null,
    playbackId: null,
    videoUrl: sampleVideo.videoUrl || null
  };

  if (upload.status === 'asset_created' && upload.asset_id) {
    const asset = await muxService.getAssetDetails(upload.asset_id);
    responseData.status = asset.status || upload.status;
    responseData.assetId = upload.asset_id;

    const playbackId = asset.playback_ids?.[0]?.id || null;
    if (playbackId) {
      responseData.playbackId = playbackId;
      responseData.videoUrl = `https://stream.mux.com/${playbackId}.m3u8`;

      const sampleVideoData = typeof sampleVideo.toObject === 'function'
        ? sampleVideo.toObject()
        : sampleVideo;
      const previousMuxAssetId = sampleVideo.muxAssetId && sampleVideo.muxAssetId !== upload.asset_id
        ? sampleVideo.muxAssetId
        : null;

      tutorApproval.sampleVideo = {
        ...sampleVideoData,
        videoUrl: responseData.videoUrl,
        publicId: upload.asset_id,
        resourceType: 'mux',
        muxUploadId: uploadId,
        muxAssetId: upload.asset_id,
        muxPlaybackId: playbackId,
        videoStatus: 'ready',
        uploadedAt: sampleVideo.uploadedAt || new Date()
      };

      user.markModified('profile');
      await user.save();

      if (previousMuxAssetId) {
        muxService.deleteAsset(previousMuxAssetId).catch((error) => {
          console.error('Failed to delete previous tutor sample video Mux asset:', error);
        });
      }
    }
  } else if (upload.status === 'errored') {
    tutorApproval.sampleVideo.videoStatus = 'failed';
    user.markModified('profile');
    await user.save();
  }

  return {
    message: 'Mux sample video status retrieved.',
    data: {
      ...responseData,
      user: toPublicUser(user),
      tutorApproval
    }
  };
};

const resubmitTutorApproval = async ({ userId }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (user.role !== 'tutor') {
    throw new ApiError(403, 'Tutor account required', 'TUTOR_ACCOUNT_REQUIRED');
  }

  const approval = ensureTutorApprovalProfile(user);
  if (!user.profile.bio || !approval.credentials?.length || !approval.sampleVideo?.videoUrl) {
    throw new ApiError(400, 'Bio, Aadhaar, and one sample video are required before submission', 'TUTOR_APPROVAL_INCOMPLETE');
  }

  user.status = 'pending_approval';
  approval.rejectionReason = '';
  approval.resubmittedAt = new Date();
  user.markModified('profile');
  await user.save();

  if (user.institutionId) {
    await InstitutionMembership.findOneAndUpdate(
      {
        userId: user._id,
        institutionId: user.institutionId,
        deletedAt: null
      },
      {
        $set: {
          status: 'pending_approval'
        }
      }
    );
  }

  return {
    message: 'Tutor application submitted for review.',
    data: {
      user: toPublicUser(user),
      tutorApproval: approval
    }
  };
};

const verifyEmailChange = async ({ userId, payload, requestMeta }) => {
  const metadata = await otpService.verifyOtp({
    userId,
    purpose: otpService.PURPOSES.EMAIL_CHANGE,
    otp: payload.otp
  });

  const newEmail = normalizeEmail(metadata.newEmail || '');

  if (!newEmail) {
    throw new ApiError(400, 'Invalid or expired OTP', 'OTP_INVALID');
  }

  const duplicate = await User.exists({
    _id: {
      $ne: userId
    },
    email: newEmail,
    deletedAt: null
  });

  if (duplicate) {
    throw new ApiError(409, 'Email is already registered', 'EMAIL_ALREADY_EXISTS');
  }

  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      deletedAt: null
    },
    {
      $set: {
        email: newEmail,
        emailVerified: true
      }
    },
    {
      new: true,
      runValidators: true,
      select: '+googleRefreshToken'
    }
  );

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  await revokeOtherUserSessions({
    userId,
    reason: 'email_changed',
    ip: requestMeta?.ip,
    currentRefreshToken: payload.refreshToken
  });

  return {
    message: 'Email changed successfully.',
    data: {
      user: toPublicUser(user)
    }
  };
};

const changePassword = async ({ userId, payload, requestMeta }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  }).select('+passwordHash');

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const matches = await comparePassword(payload.currentPassword, user.passwordHash);

  if (!matches) {
    throw new ApiError(400, 'Current password is incorrect', 'CURRENT_PASSWORD_INVALID');
  }

  const passwordHash = await hashPassword(payload.newPassword);

  await User.updateOne(
    {
      _id: userId,
      deletedAt: null
    },
    {
      $set: {
        passwordHash,
        failedLoginAttempts: 0,
        lockUntil: null
      }
    }
  );

  await revokeAllUserSessions({
    userId,
    reason: 'password_changed',
    ip: requestMeta?.ip
  });

  return {
    message: 'Password changed successfully. Please log in again.'
  };
};

const getNotificationSettings = async ({ userId }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const publicUser = toPublicUser(user);

  return {
    message: 'Notification settings retrieved successfully.',
    data: {
      notificationSettings: publicUser.notificationSettings
    }
  };
};

const updateNotificationSettings = async ({ userId, payload }) => {
  const user = await User.findOne({
    _id: userId,
    deletedAt: null
  });

  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (!user.notificationSettings) {
    user.notificationSettings = {};
  }

  const settingTypes = [
    'enrollmentConfirmed',
    'newLesson',
    'liveClassReminder',
    'assignmentGraded',
    'quizResult',
    'paymentSuccess',
    'newStudentEnrolled'
  ];

  for (const type of settingTypes) {
    if (payload[type] !== undefined) {
      if (!user.notificationSettings[type]) {
        user.notificationSettings[type] = { email: true, inApp: true };
      }
      if (payload[type].email !== undefined) {
        user.notificationSettings[type].email = payload[type].email;
      }
      if (payload[type].inApp !== undefined) {
        user.notificationSettings[type].inApp = payload[type].inApp;
      }
    }
  }

  user.markModified('notificationSettings');
  await user.save();

  const publicUser = toPublicUser(user);

  return {
    message: 'Notification settings updated successfully.',
    data: {
      notificationSettings: publicUser.notificationSettings
    }
  };
};

module.exports = {
  getProfile,
  updateProfile,
  getTutorApprovalProfile,
  updateTutorApprovalProfile,
  addTutorCredential,
  removeTutorCredential,
  uploadTutorSample,
  initTutorSampleVideoMuxUpload,
  getTutorSampleVideoMuxStatus,
  resubmitTutorApproval,
  requestEmailChange,
  verifyEmailChange,
  changePassword,
  getNotificationSettings,
  updateNotificationSettings
};
