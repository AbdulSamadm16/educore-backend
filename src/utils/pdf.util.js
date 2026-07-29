const PDFDocument = require('pdfkit');

/**
 * Generate a PDF invoice for a payment
 * @param {Object} payment - The payment object
 * @param {Object} course - The course object
 * @param {Object} user - The user (learner) object
 * @returns {Promise<Buffer>} - Resolves with the PDF Buffer
 */
const generateInvoicePdf = (payment, course, user) => {
  return new Promise((resolve, reject) => {
    try {
      // Create a document
      const doc = new PDFDocument({ margin: 50 });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // --- Header ---
      doc
        .fillColor('#444444')
        .fontSize(20)
        .text('EduCore Invoice', 50, 57)
        .fontSize(10)
        .text('EduCore Modern Learning Platform', 200, 50, { align: 'right' })
        .text('123 Education Lane', 200, 65, { align: 'right' })
        .text('contact@educore.com', 200, 80, { align: 'right' })
        .moveDown();

      const generateHr = (y) => {
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
      };

      generateHr(100);

      // --- Customer Information ---
      const customerInfoTop = 115;

      doc
        .fontSize(10)
        .text('Invoice Number:', 50, customerInfoTop)
        .font('Helvetica-Bold')
        .text(`INV-${payment.transactionId || payment._id}`, 150, customerInfoTop)
        .font('Helvetica')
        .text('Invoice Date:', 50, customerInfoTop + 15)
        .text(
          new Date(payment.paidAt || payment.createdAt).toLocaleDateString(),
          150,
          customerInfoTop + 15
        )
        
        .text('Billed To:', 300, customerInfoTop)
        .font('Helvetica-Bold')
        .text(user.name || 'Learner', 300, customerInfoTop + 15)
        .font('Helvetica')
        .text(user.email || '', 300, customerInfoTop + 30);
        
      let currentBilledToY = customerInfoTop + 45;
      
      if (payment.billingPhone) {
        doc.text(payment.billingPhone, 300, currentBilledToY);
        currentBilledToY += 15;
      }
      
      if (payment.billingAddress) {
        const addressHeight = doc.heightOfString(payment.billingAddress, { width: 200 });
        doc.text(payment.billingAddress, 300, currentBilledToY, { width: 200 });
        currentBilledToY += addressHeight;
      }
      
      doc.moveDown();

      const hrPosition = Math.max(175, currentBilledToY + 15);
      generateHr(hrPosition);

      // --- Invoice Table ---
      const invoiceTableTop = hrPosition + 25;

      doc.font('Helvetica-Bold');
      doc.text('Description', 50, invoiceTableTop);
      doc.text('Currency', 300, invoiceTableTop);
      doc.text('Total Amount', 400, invoiceTableTop, { align: 'right' });
      generateHr(invoiceTableTop + 20);
      doc.font('Helvetica');

      // Row 1
      const itemTop = invoiceTableTop + 30;
      doc
        .text(`Course: ${course.title || 'Course Access'}`, 50, itemTop)
        .text(payment.currency || 'INR', 300, itemTop)
        .text(payment.amount.toFixed(2), 400, itemTop, { align: 'right' });

      generateHr(itemTop + 25);

      // --- Total ---
      const duePosition = itemTop + 45;
      doc.font('Helvetica-Bold');
      doc.text('Total Paid:', 300, duePosition);
      doc.text(`${payment.currency || 'INR'} ${payment.amount.toFixed(2)}`, 400, duePosition, { align: 'right' });
      doc.font('Helvetica');

      // --- Footer ---
      doc
        .fontSize(10)
        .text(
          'Thank you for learning with EduCore!',
          50,
          700,
          { align: 'center', width: 500 }
        );

      // Finalize PDF file
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a PDF report for Platform Revenue Data
 * @param {Object} data - The aggregated analytics data
 * @param {Object} dateRange - The { startDate, endDate } query constraints
 * @returns {Promise<Buffer>} - Resolves with the PDF Buffer
 */
const generateRevenueReportPdf = (data, { startDate, endDate, title = 'Revenue Report' } = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // --- Title Banner ---
      doc
        .fillColor('#0f172a')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(title, 50, 50)
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Generated On: ${new Date().toLocaleDateString()}`, 50, 75);

      if (startDate || endDate) {
        const fromStr = startDate ? new Date(startDate).toLocaleDateString() : 'Beginning';
        const toStr = endDate ? new Date(endDate).toLocaleDateString() : 'Present';
        doc.text(`Date Range: ${fromStr} to ${toStr}`, 50, 90);
      } else {
        doc.text('Date Range: All-Time', 50, 90);
      }

      const generateHr = (y) => {
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
      };

      generateHr(110);

      // --- Summary KPIs ---
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text('Summary Statistics', 50, 130);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#334155')
        .text('Total Platform Revenue:', 50, 155)
        .font('Helvetica-Bold')
        .text(`INR ${Number(data.totalRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 180, 155)
        .font('Helvetica')
        .text('Total Users Registered:', 50, 175)
        .font('Helvetica-Bold')
        .text(`${Number(data.userCount || 0).toLocaleString('en-IN')}`, 180, 175)
        .font('Helvetica')
        .text('Active Course Enrollments:', 50, 195)
        .font('Helvetica-Bold')
        .text(`${Number(data.enrollmentCount || 0).toLocaleString('en-IN')}`, 180, 195);

      generateHr(215);

      let currentY = 235;

      // --- Top Courses Table ---
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text('Top Earning Courses', 50, currentY);

      currentY += 25;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
      doc.text('Course Title', 50, currentY);
      doc.text('Price', 300, currentY, { align: 'right', width: 70 });
      doc.text('Enrollments', 380, currentY, { align: 'right', width: 70 });
      doc.text('Revenue', 460, currentY, { align: 'right', width: 90 });

      currentY += 15;
      generateHr(currentY);
      currentY += 10;
      doc.font('Helvetica').fillColor('#334155');

      const topCourses = data.topCourses || [];
      if (topCourses.length === 0) {
        doc.text('No course revenue records found in this range.', 50, currentY);
        currentY += 20;
      } else {
        topCourses.forEach((c) => {
          // Course Title
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(c.title || 'Untitled Course', 50, currentY, { width: 240, height: 12, ellipsis: true });
          // Tutor Name (smaller subtitle)
          doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`Tutor: ${c.tutorName || 'Unknown Tutor'}`, 50, currentY + 13);
          
          // Price, Enrollments & Revenue
          doc.font('Helvetica').fontSize(10).fillColor('#334155');
          doc.text(`INR ${Number(c.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`, 300, currentY + 4, { align: 'right', width: 70 });
          doc.text(`${c.enrollments || 0}`, 380, currentY + 4, { align: 'right', width: 70 });
          doc.text(`INR ${Number(c.revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 460, currentY + 4, { align: 'right', width: 90 });
          
          currentY += 28;
        });
      }

      currentY += 10;
      generateHr(currentY);
      currentY += 20;

      // Page boundary check
      if (currentY > 580) {
        doc.addPage();
        currentY = 50;
      }

      // --- Tutor Revenue Table ---
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text('Revenue Breakdown by Tutor', 50, currentY);

      currentY += 25;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#64748b');
      doc.text('Tutor Name', 50, currentY);
      doc.text('Revenue Share', 450, currentY, { align: 'right', width: 100 });

      currentY += 15;
      generateHr(currentY);
      currentY += 10;
      doc.font('Helvetica').fillColor('#334155');

      const tutorBreakdown = data.tutorBreakdown || [];
      if (tutorBreakdown.length === 0) {
        doc.text('No tutor earnings data found.', 50, currentY);
        currentY += 20;
      } else {
        tutorBreakdown.forEach((t) => {
          doc.text(t.tutorName || 'Unknown Tutor', 50, currentY);
          doc.text(`INR ${Number(t.revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 450, currentY, { align: 'right', width: 100 });
          currentY += 20;
        });
      }

      // --- Footer ---
      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .text('CONFIDENTIAL — EduCore platform revenue and financials audit sheet.', 50, 730, { align: 'center', width: 500 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a PDF invoice for an institution enrollment payment.
 * Invoice Number format: INV-YYYYMM-XXXXXX
 * @param {Object} payment         - Payment record
 * @param {Object} institution     - Institution record
 * @param {Object} enrollmentRequest - EnrollmentRequest record (fee snapshot)
 * @param {Object} user            - Learner user object
 * @returns {Promise<Buffer>}
 */
const generateInstitutionInvoicePdf = (payment, institution, enrollmentRequest, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Invoice number: INV-YYYYMM-XXXXXX
      const paymentDate = payment.paidAt || payment.createdAt || new Date();
      const yyyymm = `${paymentDate.getFullYear()}${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
      const suffix = (payment.transactionId || payment._id || '').toString().replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
      const invoiceNumber = `INV-${yyyymm}-${suffix || 'XXXXXX'}`;

      const snap = enrollmentRequest?.feeSnapshot || {};
      const registrationFee = Number(snap.registrationFee || 0);
      const joiningFee      = Number(snap.joiningFee || 0);
      const monthlyFee      = Number(snap.monthlyFee || 0);
      const totalAmount     = Number(payment.amount || snap.totalInitialCost || 0);
      const currency        = payment.currency || snap.currency || 'INR';

      const generateHr = (y) => {
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
      };

      // ─── Header ───────────────────────────────────────────────────────────────
      doc
        .fillColor('#1e293b')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('EduCore Invoice', 50, 57)
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#475569')
        .text('EduCore Modern Learning Platform', 200, 50, { align: 'right' })
        .text('contact@educore.com', 200, 65, { align: 'right' });

      generateHr(95);

      // ─── Invoice meta ─────────────────────────────────────────────────────────
      const metaTop = 110;
      doc
        .fillColor('#1e293b')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Invoice Number:', 50, metaTop)
        .font('Helvetica')
        .text(invoiceNumber, 160, metaTop)
        .font('Helvetica-Bold')
        .text('Invoice Date:', 50, metaTop + 15)
        .font('Helvetica')
        .text(new Date(paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 160, metaTop + 15)
        .font('Helvetica-Bold')
        .text('Transaction ID:', 50, metaTop + 30)
        .font('Helvetica')
        .text(payment.transactionId || '—', 160, metaTop + 30)
        .font('Helvetica-Bold')
        .text('Enrollment Ref:', 50, metaTop + 45)
        .font('Helvetica')
        .text(enrollmentRequest?.paymentReference || '—', 160, metaTop + 45);

      // ─── Billed To / Institution ──────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .text('Billed To:', 350, metaTop)
        .font('Helvetica')
        .text(user.name || 'Learner', 350, metaTop + 15)
        .text(user.email || '', 350, metaTop + 30)
        .font('Helvetica-Bold')
        .text('Institution:', 350, metaTop + 50)
        .font('Helvetica')
        .text(institution.name || '—', 350, metaTop + 65)
        .fillColor('#94a3b8')
        .text(`ID: ${institution._id || institution.id || '—'}`, 350, metaTop + 80);

      generateHr(210);

      // ─── Line Items ───────────────────────────────────────────────────────────
      const tableTop = 230;
      doc
        .fillColor('#1e293b')
        .font('Helvetica-Bold')
        .text('Description', 50, tableTop)
        .text('Currency', 340, tableTop)
        .text('Amount', 470, tableTop, { align: 'right', width: 80 });

      generateHr(tableTop + 18);
      doc.font('Helvetica').fillColor('#334155');

      let rowY = tableTop + 28;

      const addRow = (label, amt) => {
        doc
          .text(label, 50, rowY, { width: 280 })
          .text(currency, 340, rowY)
          .text(amt.toFixed(2), 470, rowY, { align: 'right', width: 80 });
        rowY += 22;
      };

      if (registrationFee > 0) addRow('Registration Fee', registrationFee);
      if (joiningFee > 0)      addRow('Joining / Admission Fee', joiningFee);
      if (registrationFee === 0 && joiningFee === 0) addRow('Institution Enrollment Fee', totalAmount);

      if (monthlyFee > 0) {
        doc
          .fillColor('#94a3b8')
          .fontSize(9)
          .text(`* Monthly subscription fee: ${currency} ${monthlyFee.toFixed(2)} (billed separately)`, 50, rowY);
        rowY += 18;
        doc.fillColor('#334155').fontSize(10);
      }

      generateHr(rowY + 5);

      // ─── Total ────────────────────────────────────────────────────────────────
      const totalY = rowY + 20;
      doc
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text('Total Paid:', 340, totalY)
        .text(`${currency} ${totalAmount.toFixed(2)}`, 470, totalY, { align: 'right', width: 80 });

      // ─── Status badge ─────────────────────────────────────────────────────────
      doc
        .rect(50, totalY, 100, 20)
        .fill('#dcfce7');
      doc
        .fillColor('#16a34a')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('PAID', 50, totalY + 5, { align: 'center', width: 100 });

      // ─── Footer ───────────────────────────────────────────────────────────────
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#94a3b8')
        .text('Thank you for joining EduCore. This is a system-generated invoice.', 50, 720, { align: 'center', width: 500 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a landscape A4 certificate PDF for a course completion.
 * @param {Object} certificate  - The Certificate document
 * @param {Object} course       - The Course document
 * @param {Object} learner      - The Learner User document
 * @param {Object} tutor        - The Tutor User document
 * @param {Object} template     - The CertificateTemplate document
 * @param {Object} institution  - The Institution document (nullable)
 * @returns {Promise<Buffer>}
 */
const drawEduCoreLogo = (doc, x, y) => {
  doc.save();
  
  // Draw shield background
  doc.fillColor('#1e3a8a');
  doc.moveTo(x, y)
     .lineTo(x + 15, y - 5)
     .lineTo(x + 30, y)
     .lineTo(x + 30, y + 15)
     .quadraticCurveTo(x + 15, y + 30, x, y + 15)
     .closePath()
     .fill();

  // Draw golden graduation cap lines inside the shield
  doc.strokeColor('#d4af37').lineWidth(1.5);
  // Cap diamond
  doc.moveTo(x + 15, y + 3)
     .lineTo(x + 23, y + 7)
     .lineTo(x + 15, y + 11)
     .lineTo(x + 7, y + 7)
     .closePath()
     .stroke();
  
  // Cap stand
  doc.moveTo(x + 12, y + 11)
     .lineTo(x + 12, y + 14)
     .quadraticCurveTo(x + 15, y + 16, x + 18, y + 14)
     .lineTo(x + 18, y + 11)
     .stroke();

  // Tassel
  doc.moveTo(x + 15, y + 7)
     .lineTo(x + 21, y + 12)
     .lineTo(x + 21, y + 17)
     .stroke();
     
  doc.restore();
};

const generateCertificatePdf = (certificate, course, learner, tutor, template, institution) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const width = 842;
      const height = 595;

      const issueDate = new Date(certificate.issueDate || Date.now()).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Helper to dynamically replace placeholders in text
      const replacePlaceholders = (text, fallback) => {
        if (!text || typeof text !== 'string') return fallback;
        return text
          .replace(/\[learner_name\]/g, learner.name || '')
          .replace(/\[course_name\]/g, course.title || '')
          .replace(/\[completion_date\]/g, issueDate || '')
          .replace(/\[tutor_name\]/g, tutor ? (tutor.name || '') : 'Platform Instructor')
          .replace(/\[institution_name\]/g, institution ? (institution.name || '') : 'EduCore Academy')
          .replace(/\[certificate_id\]/g, certificate.certificateNumber || '');
      };

      // Determine colors based on type
      const isInstitutional = Boolean(institution);
      let primaryColor = isInstitutional
        ? (institution.settings?.theme?.primaryColor || '#1e3a8a')
        : '#1e3a8a'; // Navy for EduCore
      let secondaryColor = '#d4af37'; // Gold

      if (template && template.content) {
        if (template.content.primaryColor) primaryColor = template.content.primaryColor;
        if (template.content.secondaryColor) secondaryColor = template.content.secondaryColor;
      }

      // 1. Background fill
      doc.rect(0, 0, width, height).fill('#fdfdfb');

      // 2. Corner decorations / background graphics
      doc.lineWidth(1).strokeColor('#f3f4f6');
      for (let i = 0; i < width; i += 40) {
        doc.moveTo(i, 0).lineTo(i + height, height).stroke();
      }

      // Outer gold border
      doc.strokeColor(secondaryColor).lineWidth(2).rect(20, 20, width - 40, height - 40).stroke();

      // Inner thick primary border
      doc.strokeColor(primaryColor).lineWidth(6).rect(30, 30, width - 60, height - 60).stroke();

      // Corner geometric accents
      doc.fillColor(primaryColor);
      // Top-Left corner accent
      doc.rect(30, 30, 25, 25).fill();
      doc.rect(30, 30, 45, 8).fill();
      doc.rect(30, 30, 8, 45).fill();

      // Top-Right corner accent
      doc.rect(width - 55, 30, 25, 25).fill();
      doc.rect(width - 75, 30, 45, 8).fill();
      doc.rect(width - 38, 30, 8, 45).fill();

      // Bottom-Left corner accent
      doc.rect(30, height - 55, 25, 25).fill();
      doc.rect(30, height - 38, 45, 8).fill();
      doc.rect(30, height - 75, 8, 45).fill();

      // Bottom-Right corner accent
      doc.rect(width - 55, height - 55, 25, 25).fill();
      doc.rect(width - 75, height - 38, 45, 8).fill();
      doc.rect(width - 38, height - 75, 8, 45).fill();

      // 3. Header Branding
      if (isInstitutional) {
        doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold');
        doc.text(institution.name.toUpperCase(), 50, 60, { align: 'center', width: width - 100 });
      } else {
        // Platform Course: display EduCore logo and name in the header
        const logoX = width / 2 - 95;
        const logoY = 55;
        drawEduCoreLogo(doc, logoX, logoY);
        
        doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold');
        doc.text('EDUCORE ACADEMY', logoX + 40, logoY + 7, { align: 'left' });
      }

      // Read override texts from template content or fallback to standard ones
      const titleText = replacePlaceholders(template?.content?.title, 'CERTIFICATE OF COMPLETION');
      const presentationText = replacePlaceholders(template?.content?.presentationText, 'This is proudly presented to');
      const courseMessageText = replacePlaceholders(template?.content?.courseMessage, 'for successfully completing the course');
      const tutorMessageText = replacePlaceholders(template?.content?.tutorMessage, 'instructed by');

      // 4. Certificate Title
      doc.fillColor('#1e293b').fontSize(32).font('Times-Bold');
      doc.text(titleText, 50, 120, { align: 'center', width: width - 100 });

      // 5. Presentation text
      doc.fillColor('#64748b').fontSize(14).font('Times-Italic');
      doc.text(presentationText, 50, 185, { align: 'center', width: width - 100 });

      // 6. Learner Name
      doc.fillColor(primaryColor).fontSize(30).font('Helvetica-Bold');
      doc.text(learner.name, 50, 215, { align: 'center', width: width - 100 });

      // Underline the name beautifully
      doc.strokeColor(secondaryColor).lineWidth(1.5).moveTo(width / 2 - 150, 255).lineTo(width / 2 + 150, 255).stroke();

      // 7. Course text
      doc.fillColor('#64748b').fontSize(14).font('Times-Italic');
      doc.text(courseMessageText, 50, 275, { align: 'center', width: width - 100 });

      // 8. Course Title
      doc.fillColor('#0f172a').fontSize(22).font('Times-Bold');
      doc.text(`"${course.title}"`, 50, 305, { align: 'center', width: width - 100 });

      // 9. Tutor Info
      doc.fillColor('#64748b').fontSize(12).font('Times-Italic');
      doc.text(tutorMessageText, 50, 345, { align: 'center', width: width - 100 });
      
      doc.fillColor('#334155').fontSize(15).font('Helvetica-Bold');
      doc.text(tutor ? tutor.name : 'Platform Instructor', 50, 365, { align: 'center', width: width - 100 });

      // 10. Footer Section
      const footerY = 430;

      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(80, footerY + 40).lineTo(220, footerY + 40).stroke();
      doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold').text(issueDate, 80, footerY + 25, { width: 140, align: 'center' });
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('DATE OF ISSUANCE', 80, footerY + 45, { width: 140, align: 'center' });

      // Right Signature Block (Certificate Number & Verification Link)
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(width - 220 - 80, footerY + 40).lineTo(width - 80, footerY + 40).stroke();
      doc.fillColor('#334155').fontSize(10).font('Helvetica-Bold').text(certificate.certificateNumber, width - 220 - 80, footerY + 25, { width: 140, align: 'center' });
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('CERTIFICATE ID', width - 220 - 80, footerY + 45, { width: 140, align: 'center' });

      // Middle: Circular Gold Seal Badge
      const badgeX = width / 2;
      const badgeY = footerY + 30;

      // Draw ribbon 1 (left diagonal)
      doc.fillColor('#b8860b')
        .moveTo(badgeX - 15, badgeY + 15)
        .lineTo(badgeX - 25, badgeY + 60)
        .lineTo(badgeX - 10, badgeY + 55)
        .lineTo(badgeX, badgeY + 60)
        .lineTo(badgeX - 5, badgeY + 15)
        .fill();

      // Draw ribbon 2 (right diagonal)
      doc.fillColor('#b8860b')
        .moveTo(badgeX + 5, badgeY + 15)
        .lineTo(badgeX, badgeY + 60)
        .lineTo(badgeX + 10, badgeY + 55)
        .lineTo(badgeX + 25, badgeY + 60)
        .lineTo(badgeX + 15, badgeY + 15)
        .fill();

      // Outer gold circle
      doc.circle(badgeX, badgeY, 35).fillAndStroke('#d4af37', '#b8860b');
      // Inner white dotted circle
      doc.circle(badgeX, badgeY, 31).strokeColor('#ffffff').lineWidth(1).stroke();
      
      // Seal label
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      const sealText = isInstitutional ? 'OFFICIAL\nSEAL' : 'EDUCORE\nVERIFIED';
      doc.text(sealText, badgeX - 25, badgeY - 8, { width: 50, align: 'center' });

      // 11. Powered by EduCore footer (for institutional certificates)
      if (isInstitutional) {
        const powerX = width / 2 - 60;
        const powerY = height - 52;
        drawEduCoreLogo(doc, powerX, powerY);
        
        doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold');
        doc.text('Powered by EduCore', powerX + 40, powerY + 7, { align: 'left' });
      }

      // 12. Verification text at very bottom
      const verifyUrl = certificate.verificationUrl || `http://localhost:3000/certificates/validate/${certificate.certificateNumber}`;
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica');
      doc.text(`Verify authenticity: ${verifyUrl}`, 50, height - 32, { align: 'center', width: width - 100 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateInvoicePdf,
  generateRevenueReportPdf,
  generateInstitutionInvoicePdf,
  generateCertificatePdf
};
