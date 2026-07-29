const { asyncHandler, ApiError } = require('../utils/errors');
const Certificate = require('../models/certificate.model');

/**
 * @desc    Get user's certificates
 * @route   GET /api/v1/certificates/my-certificates
 * @access  Private
 */
const getMyCertificates = asyncHandler(async (req, res, next) => {
  try {
    const certificates = await Certificate.find({ userId: req.user._id })
      .populate('courseId', 'title thumbnail')
      .lean();

    const formattedCertificates = certificates.map((cert) => {
      const issueDate = new Date(cert.issueDate || Date.now());
      const year = issueDate.getFullYear();
      const month = issueDate.getMonth() + 1; // 1-indexed for LinkedIn
      
      const courseTitle = cert.courseId?.title || 'Course Completion';
      
      const certName = encodeURIComponent(courseTitle);
      const orgName = encodeURIComponent('EduCore');
      const certUrl = encodeURIComponent(cert.verificationUrl || '');
      const certId = encodeURIComponent(cert.certificateNumber);
      
      const linkedInShareUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${certName}&organizationName=${orgName}&issueYear=${year}&issueMonth=${month}&certUrl=${certUrl}&certId=${certId}`;

      return {
        ...cert,
        linkedInShareUrl
      };
    });

    res.status(200).json({
      success: true,
      message: 'Certificates retrieved successfully',
      data: formattedCertificates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get single certificate by number
 * @route   GET /api/v1/certificates/validate/:certificateNumber
 * @access  Public
 */
const validateCertificate = asyncHandler(async (req, res, next) => {
  try {
    const { certificateNumber } = req.params;

    const certificate = await Certificate.findOne({ certificateNumber })
      .populate('userId', 'name email')
      .populate('courseId', 'title')
      .lean();

    if (!certificate) {
      throw new ApiError(404, 'Certificate not found', 'CERTIFICATE_NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      message: 'Certificate is valid',
      data: certificate
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Download certificate PDF file directly
 * @route   GET /api/v1/certificates/download/:certificateNumber
 * @access  Public
 */
const downloadCertificate = asyncHandler(async (req, res, next) => {
  try {
    const { certificateNumber } = req.params;
    const fs = require('fs');
    const path = require('path');

    const certificate = await Certificate.findOne({ certificateNumber }).lean();
    if (!certificate) {
      throw new ApiError(404, 'Certificate not found', 'CERTIFICATE_NOT_FOUND');
    }

    const fileName = `${certificateNumber}.pdf`;
    const filePath = path.join(__dirname, '../../uploads/certificates', fileName);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Certificate PDF file not found on server', 'PDF_FILE_NOT_FOUND');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get active certificate templates for course creation
 * @route   GET /api/v1/certificates/templates
 * @access  Private
 */
const getAvailableTemplates = asyncHandler(async (req, res, next) => {
  try {
    const CertificateTemplate = require('../models/certificateTemplate.model');

    const query = {
      isActive: true
    };

    if (req.user.institutionId) {
      query.scope = 'institution';
      query.institutionId = req.user.institutionId;
    } else {
      query.scope = 'platform';
    }

    const templates = await CertificateTemplate.find(query)
      .select('name thumbnailUrl scope version content isActive')
      .lean();

    const formattedTemplates = templates.map((t) => {
      return {
        ...t,
        id: t._id.toString()
      };
    });

    res.status(200).json({
      success: true,
      message: 'Active certificate templates retrieved successfully',
      data: formattedTemplates
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Preview an active template for tutor
 * @route   GET /api/v1/certificates/templates/:id/preview
 * @access  Private
 */
const previewTemplateForTutor = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const CertificateTemplate = require('../models/certificateTemplate.model');
    const { generateCertificatePdf } = require('../utils/pdf.util');

    const template = await CertificateTemplate.findById(id).lean();
    if (!template) {
      throw new ApiError(404, 'Certificate template not found', 'TEMPLATE_NOT_FOUND');
    }

    if (req.user.institutionId) {
      if (template.scope !== 'institution' || template.institutionId?.toString() !== req.user.institutionId?.toString()) {
        throw new ApiError(403, 'Not authorized to preview this template', 'FORBIDDEN');
      }
    } else {
      if (template.scope !== 'platform') {
        throw new ApiError(403, 'Not authorized to preview this template', 'FORBIDDEN');
      }
    }

    const dummyLearner = { name: 'Student Name', email: 'student@example.com' };
    const dummyCourse = { title: 'Course Title' };
    const dummyTutor = { name: req.user.name || 'Tutor Name' };
    const dummyCertificate = {
      certificateNumber: 'CERT-PREVIEW-0000',
      issueDate: new Date()
    };

    const pdfBuffer = await generateCertificatePdf(
      dummyCertificate,
      dummyCourse,
      dummyLearner,
      dummyTutor,
      template,
      null
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  getMyCertificates,
  validateCertificate,
  downloadCertificate,
  getAvailableTemplates,
  previewTemplateForTutor
};

