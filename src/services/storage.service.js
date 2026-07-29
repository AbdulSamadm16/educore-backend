const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');

const allowedAvatarMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const sanitizePublicIdPart = (value) => String(value)
  .replace(/[^a-zA-Z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 80);

const uploadBufferToCloudinary = ({ buffer, folder, publicId }) => new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
      type: 'upload',
      transformation: [
        {
          width: 512,
          height: 512,
          crop: 'limit'
        },
        {
          fetch_format: 'auto',
          quality: 'auto'
        }
      ]
    },
    (error, result) => {
      if (error) {
        return reject(error);
      }

      return resolve(result);
    }
  );

  uploadStream.end(buffer);
});

const uploadRawBufferToCloudinary = ({ buffer, folder, publicId }) => new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'raw',
      type: 'upload'
    },
    (error, result) => {
      if (error) {
        return reject(error);
      }

      return resolve(result);
    }
  );

  uploadStream.end(buffer);
});

const uploadImageBufferToCloudinary = ({ buffer, folder, publicId }) => new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
      type: 'upload'
    },
    (error, result) => {
      if (error) {
        return reject(error);
      }

      return resolve(result);
    }
  );

  uploadStream.end(buffer);
});

const uploadVideoBufferToCloudinary = ({ buffer, folder, publicId }) => new Promise((resolve, reject) => {
  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'video',
      type: 'upload'
    },
    (error, result) => {
      if (error) {
        return reject(error);
      }

      return resolve(result);
    }
  );

  uploadStream.end(buffer);
});

const uploadAvatar = async ({ userId, file }) => {
  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  if (!allowedAvatarMimeTypes.has(file.mimetype)) {
    throw new ApiError(400, 'Unsupported avatar file type', 'INVALID_AVATAR_TYPE');
  }

  const originalName = path.parse(file.originalname || 'avatar').name;
  const folder = `${env.cloudinary.avatarFolder}/users/${sanitizePublicIdPart(userId)}`;
  const publicId = `avatar_${Date.now()}_${sanitizePublicIdPart(originalName)}`;

  const result = await uploadBufferToCloudinary({
    buffer: file.buffer,
    folder,
    publicId
  });

  return result.secure_url;
};

const uploadCourseThumbnail = async ({ courseId, file }) => {
  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const folder = `${env.cloudinary.avatarFolder}/courses/${sanitizePublicIdPart(courseId)}`;
  // Use a fixed publicId for the course thumbnail so it overwrites the old one
  const publicId = `thumb_master`;

  const result = await uploadBufferToCloudinary({
    buffer: file.buffer,
    folder,
    publicId
  });

  return result.secure_url;
};

const uploadAttachment = async ({ lessonId, file }) => {
  const parsed = path.parse(file.originalname || 'attachment');
  const originalName = parsed.name;
  const extension = parsed.ext || '';

  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const folder = `${env.cloudinary.avatarFolder}/lessons/${sanitizePublicIdPart(lessonId)}/attachments`;
  const publicId = `attach_${Date.now()}_${sanitizePublicIdPart(originalName)}${extension}`;

  const result = await uploadRawBufferToCloudinary({
    buffer: file.buffer,
    folder,
    publicId
  });

  return {
    title: file.originalname || 'Supplementary Material',
    fileUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    mimeType: file.mimetype || null,
    bytes: result.bytes || (file.buffer && file.buffer.length) || 0
  };
};

const uploadSubtitle = async ({ lessonId, file }) => {
  const parsed = path.parse(file.originalname || 'subtitle');
  const originalName = parsed.name;
  const extension = parsed.ext || '.vtt';

  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const baseFolder = (env.cloudinary.avatarFolder || 'educore').split('/')[0];
  const folder = `${baseFolder}/lessons/${sanitizePublicIdPart(lessonId)}/subtitles`;
  const publicId = `subtitle_${Date.now()}_${sanitizePublicIdPart(originalName)}${extension}`;

  const result = await uploadRawBufferToCloudinary({
    buffer: file.buffer,
    folder,
    publicId
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    bytes: result.bytes
  };
};

const uploadSubmissionFile = async ({ userId, file }) => {
  const parsed = path.parse(file.originalname || 'submission');
  const originalName = parsed.name;
  const extension = parsed.ext || '';

  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const folder = `${env.cloudinary.avatarFolder}/submissions/user_${sanitizePublicIdPart(userId)}`;
  const publicId = `sub_${Date.now()}_${sanitizePublicIdPart(originalName)}${extension}`;

  const isImage = file.mimetype && file.mimetype.startsWith('image/');

  const result = isImage
    ? await uploadImageBufferToCloudinary({
        buffer: file.buffer,
        folder,
        publicId
      })
    : await uploadRawBufferToCloudinary({
        buffer: file.buffer,
        folder,
        publicId
      });

  return {
    title: file.originalname || 'Submission Asset',
    fileUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    mimeType: file.mimetype || null,
    bytes: result.bytes || (file.buffer && file.buffer.length) || 0
  };
};

const uploadTutorCredential = async ({ userId, file }) => {
  const parsed = path.parse(file.originalname || 'credential');
  const originalName = parsed.name;
  const extension = parsed.ext || '';

  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const folder = `${env.cloudinary.avatarFolder}/tutors/${sanitizePublicIdPart(userId)}/credentials`;
  const publicId = `credential_${Date.now()}_${sanitizePublicIdPart(originalName)}${extension}`;
  const isImage = file.mimetype && file.mimetype.startsWith('image/');

  const result = isImage
    ? await uploadImageBufferToCloudinary({ buffer: file.buffer, folder, publicId })
    : await uploadRawBufferToCloudinary({ buffer: file.buffer, folder, publicId });

  return {
    title: file.originalname || 'Credential',
    fileUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    mimeType: file.mimetype || null,
    size: result.bytes || (file.buffer && file.buffer.length) || 0
  };
};

const uploadTutorSampleVideo = async ({ userId, file }) => {
  const parsed = path.parse(file.originalname || 'sample-video');
  const originalName = parsed.name;
  const extension = parsed.ext || '';

  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const folder = `${env.cloudinary.avatarFolder}/tutors/${sanitizePublicIdPart(userId)}/sample-videos`;
  const publicId = `sample_${Date.now()}_${sanitizePublicIdPart(originalName)}${extension}`;
  const result = await uploadVideoBufferToCloudinary({ buffer: file.buffer, folder, publicId });

  return {
    title: file.originalname || 'Sample Video',
    videoUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    mimeType: file.mimetype || null,
    size: result.bytes || (file.buffer && file.buffer.length) || 0
  };
};

const deleteResource = async ({ publicId, resourceType = 'raw' }) => {
  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  try {
    // cloudinary.uploader.destroy supports resource_type option for raw files
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return res;
  } catch (err) {
    console.error('[StorageService] Failed to delete Cloudinary resource', publicId, err);
    throw err;
  }
};

module.exports = {
  uploadAvatar,
  uploadCourseThumbnail,
  uploadAttachment,
  uploadSubtitle,
  uploadSubmissionFile,
  uploadTutorCredential,
  uploadTutorSampleVideo,
  deleteResource
};
