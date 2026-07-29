const { asyncHandler, ApiError } = require('../utils/errors');
const CertificateTemplate = require('../models/certificateTemplate.model');
const { generateCertificatePdf } = require('../utils/pdf.util');

/**
 * @desc    Get all platform certificate templates
 * @route   GET /api/v1/platform-admin/certificate-templates
 * @access  Private (Platform Admin)
 */
const getPlatformTemplates = asyncHandler(async (req, res, next) => {
  try {
    const templates = await CertificateTemplate.find({ scope: 'platform' })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const formattedTemplates = templates.map((t) => {
      return {
        ...t,
        id: t._id.toString()
      };
    });

    res.status(200).json({
      success: true,
      message: 'Platform certificate templates retrieved successfully',
      data: formattedTemplates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Create a new platform certificate template
 * @route   POST /api/v1/platform-admin/certificate-templates
 * @access  Private (Platform Admin)
 */
const createPlatformTemplate = asyncHandler(async (req, res, next) => {
  try {
    const { name, thumbnailUrl, isActive, content } = req.body;

    const activeState = isActive !== undefined ? isActive : true;

    // Limit check: maximum 4 active platform templates
    if (activeState) {
      const activeCount = await CertificateTemplate.countDocuments({
        scope: 'platform',
        isActive: true
      });
      if (activeCount >= 4) {
        throw new ApiError(
          400,
          'Maximum active platform certificate templates limit of 4 has been reached',
          'ACTIVE_LIMIT_EXCEEDED'
        );
      }
    }

    const template = await CertificateTemplate.create({
      name,
      thumbnailUrl: thumbnailUrl || '',
      scope: 'platform',
      isActive: activeState,
      content: content || null,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Platform certificate template created successfully',
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Update a platform certificate template
 * @route   PATCH /api/v1/platform-admin/certificate-templates/:id
 * @access  Private (Platform Admin)
 */
const updatePlatformTemplate = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, thumbnailUrl, isActive, content } = req.body;

    const template = await CertificateTemplate.findById(id);
    if (!template) {
      throw new ApiError(404, 'Platform certificate template not found', 'TEMPLATE_NOT_FOUND');
    }

    if (template.scope !== 'platform') {
      throw new ApiError(403, 'Cannot modify non-platform templates via this endpoint', 'FORBIDDEN');
    }

    // Limit check: maximum 4 active platform templates
    if (isActive === true && !template.isActive) {
      const activeCount = await CertificateTemplate.countDocuments({
        scope: 'platform',
        isActive: true
      });
      if (activeCount >= 4) {
        throw new ApiError(
          400,
          'Maximum active platform certificate templates limit of 4 has been reached',
          'ACTIVE_LIMIT_EXCEEDED'
        );
      }
    }

    // Check content changes to trigger versioning
    let updatedVersion = template.version;
    if (content !== undefined) {
      const existingContentStr = JSON.stringify(template.content);
      const incomingContentStr = JSON.stringify(content);
      if (existingContentStr !== incomingContentStr) {
        updatedVersion = template.version + 1;
      }
    }

    if (name !== undefined) template.name = name;
    if (thumbnailUrl !== undefined) template.thumbnailUrl = thumbnailUrl;
    if (isActive !== undefined) template.isActive = isActive;
    if (content !== undefined) template.content = content;
    template.version = updatedVersion;
    template.updatedBy = req.user._id;

    await template.save();

    res.status(200).json({
      success: true,
      message: 'Platform certificate template updated successfully',
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to generate preview PDF for dummy data
 */
const renderDummyPreview = async (templateContent, res) => {
  const dummyLearner = { name: 'John Doe', email: 'johndoe@example.com' };
  const dummyCourse = { title: 'Introduction to Web Development' };
  const dummyTutor = { name: 'Jane Smith' };
  const dummyCertificate = {
    certificateNumber: 'CERT-PREVIEW-0000',
    issueDate: new Date()
  };
  const dummyTemplate = {
    content: templateContent || null
  };

  const pdfBuffer = await generateCertificatePdf(
    dummyCertificate,
    dummyCourse,
    dummyLearner,
    dummyTutor,
    dummyTemplate,
    null
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
  res.status(200).send(pdfBuffer);
};

/**
 * @desc    Preview template with raw request body
 * @route   POST /api/v1/platform-admin/certificate-templates/preview
 * @access  Private (Platform Admin)
 */
const previewRawTemplate = asyncHandler(async (req, res, next) => {
  try {
    const { content } = req.body;
    await renderDummyPreview(content, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Preview existing template by ID
 * @route   POST /api/v1/platform-admin/certificate-templates/:id/preview
 * @access  Private (Platform Admin)
 */
const previewExistingTemplate = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await CertificateTemplate.findById(id).lean();
    if (!template) {
      throw new ApiError(404, 'Platform certificate template not found', 'TEMPLATE_NOT_FOUND');
    }
    await renderDummyPreview(template.content, res);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  getPlatformTemplates,
  createPlatformTemplate,
  updatePlatformTemplate,
  previewRawTemplate,
  previewExistingTemplate
};
