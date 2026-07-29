const { asyncHandler, ApiError } = require('../utils/errors');
const CertificateTemplate = require('../models/certificateTemplate.model');
const Institution = require('../models/institution.model');
const { generateCertificatePdf } = require('../utils/pdf.util');

/**
 * Helper to assert user has institution association
 */
const assertInstitutionUser = (req) => {
  if (!req.user.institutionId) {
    throw new ApiError(400, 'User is not associated with an institution', 'INSTITUTION_REQUIRED');
  }
};

/**
 * @desc    Get all templates for the admin's institution
 * @route   GET /api/v1/institution-admin/certificate-templates
 * @access  Private (Institution Admin)
 */
const getInstitutionTemplates = asyncHandler(async (req, res, next) => {
  try {
    assertInstitutionUser(req);

    const templates = await CertificateTemplate.find({
      scope: 'institution',
      institutionId: req.user.institutionId
    })
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
      message: 'Institution certificate templates retrieved successfully',
      data: formattedTemplates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Create a new institution-scoped certificate template
 * @route   POST /api/v1/institution-admin/certificate-templates
 * @access  Private (Institution Admin)
 */
const createInstitutionTemplate = asyncHandler(async (req, res, next) => {
  try {
    assertInstitutionUser(req);
    const { name, thumbnailUrl, isActive, content } = req.body;

    const activeState = isActive !== undefined ? isActive : true;

    // Limit check: maximum 4 active templates per institution
    if (activeState) {
      const activeCount = await CertificateTemplate.countDocuments({
        scope: 'institution',
        institutionId: req.user.institutionId,
        isActive: true
      });
      if (activeCount >= 4) {
        throw new ApiError(
          400,
          'Maximum active institution certificate templates limit of 4 has been reached',
          'ACTIVE_LIMIT_EXCEEDED'
        );
      }
    }

    const template = await CertificateTemplate.create({
      name,
      thumbnailUrl: thumbnailUrl || '',
      scope: 'institution',
      institutionId: req.user.institutionId,
      isActive: activeState,
      content: content || null,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Institution certificate template created successfully',
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Update an institution certificate template
 * @route   PATCH /api/v1/institution-admin/certificate-templates/:id
 * @access  Private (Institution Admin)
 */
const updateInstitutionTemplate = asyncHandler(async (req, res, next) => {
  try {
    assertInstitutionUser(req);
    const { id } = req.params;
    const { name, thumbnailUrl, isActive, content } = req.body;

    const template = await CertificateTemplate.findById(id);
    if (!template) {
      throw new ApiError(404, 'Institution certificate template not found', 'TEMPLATE_NOT_FOUND');
    }

    // Verify ownership
    if (String(template.institutionId) !== String(req.user.institutionId)) {
      throw new ApiError(
        403,
        'Cannot modify certificate templates belonging to another institution',
        'FORBIDDEN'
      );
    }

    // Limit check: maximum 4 active templates per institution
    if (isActive === true && !template.isActive) {
      const activeCount = await CertificateTemplate.countDocuments({
        scope: 'institution',
        institutionId: req.user.institutionId,
        isActive: true
      });
      if (activeCount >= 4) {
        throw new ApiError(
          400,
          'Maximum active institution certificate templates limit of 4 has been reached',
          'ACTIVE_LIMIT_EXCEEDED'
        );
      }
    }

    // Version check
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
      message: 'Institution certificate template updated successfully',
      data: template
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to render dummy PDF with institution context
 */
const renderDummyPreview = async (req, templateContent, res) => {
  let institution = null;
  if (req.user.institutionId) {
    institution = await Institution.findById(req.user.institutionId).lean();
  }

  // Fallback if institution document not in DB or details missing
  if (!institution) {
    institution = {
      name: 'Test Institution',
      settings: {
        theme: {
          primaryColor: '#1e3a8a'
        }
      }
    };
  }

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
    institution
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
  res.status(200).send(pdfBuffer);
};

/**
 * @desc    Preview raw template configuration
 * @route   POST /api/v1/institution-admin/certificate-templates/preview
 * @access  Private (Institution Admin)
 */
const previewRawTemplate = asyncHandler(async (req, res, next) => {
  try {
    assertInstitutionUser(req);
    const { content } = req.body;
    await renderDummyPreview(req, content, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Preview existing template by ID
 * @route   POST /api/v1/institution-admin/certificate-templates/:id/preview
 * @access  Private (Institution Admin)
 */
const previewExistingTemplate = asyncHandler(async (req, res, next) => {
  try {
    assertInstitutionUser(req);
    const { id } = req.params;

    const template = await CertificateTemplate.findById(id).lean();
    if (!template) {
      throw new ApiError(404, 'Institution certificate template not found', 'TEMPLATE_NOT_FOUND');
    }

    if (String(template.institutionId) !== String(req.user.institutionId)) {
      throw new ApiError(
        403,
        'Cannot preview certificate templates belonging to another institution',
        'FORBIDDEN'
      );
    }

    await renderDummyPreview(req, template.content, res);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  getInstitutionTemplates,
  createInstitutionTemplate,
  updateInstitutionTemplate,
  previewRawTemplate,
  previewExistingTemplate
};
