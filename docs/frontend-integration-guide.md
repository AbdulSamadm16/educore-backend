# Frontend Integration Guide: Certificate Template Management

This guide details the API endpoints, data models, error codes, and implementation patterns required to integrate the Platform Admin and Institution Admin Certificate Template Management UIs with the backend.

---

## 1. Overview of Template Configurations

Certificate templates are stored as database documents with custom design parameters inside the `content` object.

### The Template Content Schema (`content` object)
The `content` object allows admins to override standard text strings and brand colors. All text fields support dynamic placeholders.

```json
{
  "title": "CERTIFICATE OF COMPLETION",
  "presentationText": "This is proudly presented to [learner_name]",
  "courseMessage": "for successfully completing the course",
  "tutorMessage": "instructed by [tutor_name]",
  "primaryColor": "#1e3a8a",
  "secondaryColor": "#d4af37"
}
```

### Supported Placeholders
Admins can place these text tags anywhere inside the text fields of the `content` configuration. The backend will automatically swap them out with actual database values when generating a certificate:

- `[learner_name]` -> Name of the learner who completed the course.
- `[course_name]` -> Title of the completed course.
- `[completion_date]` -> Formatted date of course completion (e.g. `June 26, 2026`).
- `[tutor_name]` -> Name of the tutor who instructs the course (falls back to "Platform Instructor").
- `[institution_name]` -> Name of the institution for institution courses (falls back to "EduCore Academy").
- `[certificate_id]` -> Unique identifier code of the certificate (e.g., `CERT-XXXX-XXXX-XXXX`).

---

## 2. API Reference

All requests must include standard credentials (either a JWT cookie or an `Authorization: Bearer <token>` header).

### A. Platform Admin Endpoints
*Permissions Required:* `platform_admin` / `super_admin` / `platform_owner`

#### 1. List All Platform Templates
- **Method & Path**: `GET /api/v1/platform-admin/certificate-templates`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Platform certificate templates retrieved successfully",
    "data": [
      {
        "id": "6a3e6297eb648eb5f716b77d",
        "name": "EduCore Classic Blue",
        "thumbnailUrl": "https://cdn.example.com/thumbnails/classic-blue.png",
        "scope": "platform",
        "institutionId": null,
        "version": 2,
        "isActive": true,
        "content": {
          "title": "CERTIFICATE OF COMPLETION",
          "presentationText": "This is proudly presented to [learner_name]",
          "courseMessage": "for successfully completing the course [course_name]",
          "tutorMessage": "instructed by [tutor_name]",
          "primaryColor": "#1e3a8a",
          "secondaryColor": "#d4af37"
        },
        "createdBy": { "id": "6a3e6...", "name": "Admin Name" },
        "updatedBy": { "id": "6a3e6...", "name": "Admin Name" },
        "createdAt": "2026-06-26T11:29:22.000Z",
        "updatedAt": "2026-06-26T11:29:32.000Z"
      }
    ]
  }
  ```

#### 2. Create Platform Template
- **Method & Path**: `POST /api/v1/platform-admin/certificate-templates`
- **Body (`application/json`)**:
  ```json
  {
    "name": "Modern Minimalist",
    "thumbnailUrl": "https://cdn.example.com/thumbnails/minimalist.png",
    "isActive": true,
    "content": {
      "title": "COMPLETION AWARD",
      "presentationText": "Presented to [learner_name]",
      "primaryColor": "#0f172a",
      "secondaryColor": "#64748b"
    }
  }
  ```
- **Response `201 Created`**

#### 3. Update Platform Template
- **Method & Path**: `PATCH /api/v1/platform-admin/certificate-templates/:id`
- **Body (`application/json`)**:
  *Pass only the fields that are being modified.*
  ```json
  {
    "isActive": false
  }
  ```

> [!NOTE]
> If the `content` object is sent in a `PATCH` request and is different from what is currently stored in the database, the template's `version` increments by 1. Modifying only the `name` or `thumbnailUrl` does NOT increment the version.

#### 4. Live Preview Raw Configuration (Before Saving)
Use this endpoint to let admins preview how a template will look while they edit it.
- **Method & Path**: `POST /api/v1/platform-admin/certificate-templates/preview`
- **Body (`application/json`)**:
  ```json
  {
    "content": {
      "title": "CERTIFICATE OF ACHIEVEMENT",
      "primaryColor": "#7c3aed"
    }
  }
  ```
- **Response `200 OK`**: Binary PDF buffer stream (`Content-Type: application/pdf`).

#### 5. Preview Existing Saved Template
- **Method & Path**: `POST /api/v1/platform-admin/certificate-templates/:id/preview`
- **Body**: Empty.
- **Response `200 OK`**: Binary PDF buffer stream (`Content-Type: application/pdf`).

---

### B. Institution Admin Endpoints
*Permissions Required:* `institution_admin` / `admin` / `super_admin` (User must be associated with an institution)

These endpoints function exactly like the Platform Admin endpoints, but they automatically scope operations to the authenticated admin's `institutionId`.

- `GET /api/v1/institution-admin/certificate-templates` (Lists templates matching user's `institutionId`).
- `POST /api/v1/institution-admin/certificate-templates` (Creates templates; automatically sets `scope: 'institution'` and `institutionId: req.user.institutionId`).
- `PATCH /api/v1/institution-admin/certificate-templates/:id` (Updates template details; enforces that the template belongs to the admin's institution).
- `POST /api/v1/institution-admin/certificate-templates/preview` (Live raw preview using the admin's institution settings and custom texts).
- `POST /api/v1/institution-admin/certificate-templates/:id/preview` (Preview of the saved institution template).

---

### C. Tutor Endpoints (Used During Course Creation)
*Permissions Required:* Authenticated users (Tutors / Admins)

#### 1. Retrieve Active Templates list
Tutors use this endpoint to fetch active templates to populate template dropdown menus during course creation or editing.
- **Method & Path**: `GET /api/v1/certificates/templates`
- **Response `200 OK`**:
  *For a Platform Tutor, it returns only active platform templates. For an Institution Tutor, it returns active platform templates AND active templates created by their specific institution.*
  ```json
  {
    "success": true,
    "message": "Active certificate templates retrieved successfully",
    "data": [
      {
        "id": "6a3e6297eb648eb5f716b77d",
        "name": "EduCore Classic Blue",
        "thumbnailUrl": "",
        "scope": "platform",
        "version": 2,
        "isActive": true,
        "content": { ... }
      }
    ]
  }
  ```

---

## 3. Integrating with Course Settings (Tutors)

While creating or editing a course, tutors specify whether certificates are issued and select a template. Tutors will update these parameters on the course object using the standard course update endpoint:

```json
{
  "certificateEnabled": true,
  "certificateTemplateId": "6a3e6297eb648eb5f716b77d"
}
```

> [!WARNING]
> When the tutor publishes a course (`POST /courses/:id/publish` or similar), the backend will automatically validate that the selected template is active and has the correct scope. It will freeze the design by copying the template's current active version to `course.certificateTemplateVersion`.

---

## 4. Frontend Implementation Recipes

### Rendering PDF Previews
To display the PDF preview generated by the preview endpoints in a browser component, fetch the response as a blob and convert it to a local URL:

```javascript
// Example React snippet
const handlePreview = async () => {
  try {
    const response = await axios.post(
      '/api/v1/platform-admin/certificate-templates/preview',
      { content: currentContent },
      { responseType: 'blob' }
    );
    const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Set this URL to an iframe src or a viewer state
    setPreviewUrl(pdfUrl);
  } catch (error) {
    console.error('Failed to generate preview', error);
  }
};

// Render iframe
<iframe src={previewUrl} className="w-full h-[500px]" title="Certificate Preview" />
```

### Handling Limits (4 Active Templates Limit)
If an admin attempts to activate or create an active template when 4 active templates already exist, the backend returns a `400 Bad Request` with code `ACTIVE_LIMIT_EXCEEDED`.

**Payload Error Contract**:
```json
{
  "success": false,
  "message": "Maximum active platform certificate templates limit of 4 has been reached",
  "code": "ACTIVE_LIMIT_EXCEEDED"
}
```

**UX Guideline**:
Catch this error and display a modal or alert banner:
> "You have reached the limit of 4 active templates. Please deactivate one of your other templates in the templates list before activating this one."
