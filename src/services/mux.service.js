const Mux = require('@mux/mux-node');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');

if (!env.mux.tokenId || !env.mux.tokenSecret) {
  console.warn('[WARNING] Mux credentials are not configured in environment variables. Mux uploads will fail.');
}

const muxClient = (env.mux.tokenId && env.mux.tokenSecret)
  ? new Mux({
      tokenId: env.mux.tokenId,
      tokenSecret: env.mux.tokenSecret
    })
  : null;

/**
 * Creates a secure, signed direct upload URL from Mux Cloud
 * @returns {Promise<Object>} Mux direct upload object containing URL and Upload ID
 */
const createDirectUpload = async () => {
  if (!muxClient) {
    throw new ApiError(500, 'Mux integration is not configured. Please supply MUX_TOKEN_ID and MUX_TOKEN_SECRET.', 'MUX_NOT_CONFIGURED');
  }

  try {
    const upload = await muxClient.video.uploads.create({
      new_asset_settings: {
        playback_policy: ['public']
      },
      cors_origin: '*'
    });
    return upload;
  } catch (error) {
    console.error('Error creating Mux direct upload:', error);
    throw new ApiError(500, `Mux Direct Upload creation failed: ${error.message}`, 'MUX_UPLOAD_ERROR');
  }
};

/**
 * Retrieves the current status of an upload session from Mux Cloud
 * @param {string} uploadId The Mux upload identifier
 * @returns {Promise<Object>} Mux upload status object
 */
const getUploadStatus = async (uploadId) => {
  if (!muxClient) {
    throw new ApiError(500, 'Mux integration is not configured', 'MUX_NOT_CONFIGURED');
  }

  try {
    const upload = await muxClient.video.uploads.retrieve(uploadId);
    return upload;
  } catch (error) {
    console.error(`Error retrieving Mux upload status for ID ${uploadId}:`, error);
    throw new ApiError(500, `Mux status retrieval failed: ${error.message}`, 'MUX_STATUS_ERROR');
  }
};

/**
 * Retrieves full details for a Mux video Asset (like playback IDs, status, aspect ratio, duration)
 * @param {string} assetId The Mux asset identifier
 * @returns {Promise<Object>} Mux asset details
 */
const getAssetDetails = async (assetId) => {
  if (!muxClient) {
    throw new ApiError(500, 'Mux integration is not configured', 'MUX_NOT_CONFIGURED');
  }

  try {
    const asset = await muxClient.video.assets.retrieve(assetId);
    return asset;
  } catch (error) {
    console.error(`Error retrieving Mux asset details for ID ${assetId}:`, error);
    throw new ApiError(500, `Mux asset retrieval failed: ${error.message}`, 'MUX_ASSET_ERROR');
  }
};

/**
 * Deletes a Mux video Asset to free up storage
 * @param {string} assetId The Mux asset identifier
 * @returns {Promise<boolean>} Success status
 */
const deleteAsset = async (assetId) => {
  if (!muxClient) {
    throw new ApiError(500, 'Mux integration is not configured', 'MUX_NOT_CONFIGURED');
  }

  try {
    await muxClient.video.assets.delete(assetId);
    return true;
  } catch (error) {
    console.error(`Error deleting Mux asset ID ${assetId}:`, error);
    // If it's already deleted (404), treat as success
    if (error.status === 404) return true;
    throw new ApiError(500, `Mux asset deletion failed: ${error.message}`, 'MUX_DELETE_ERROR');
  }
};

module.exports = {
  createDirectUpload,
  getUploadStatus,
  getAssetDetails,
  deleteAsset
};
