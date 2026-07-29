const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'EduCore LMS API Documentation',
    version: '1.0.0',
    description: `
      EduCore LMS Auth, User, and Course Management API documentation.
      
      ### Authentication Instructions:
      1. Use the **POST /auth/login** endpoint to authenticate and receive an access token.
      2. Click the **Authorize** button in the upper-right corner of this page.
      3. Enter the token in the input box (Format: \`YOUR_TOKEN_HERE\` - do not include the word Bearer).
      4. Click Authorize to test authenticated endpoints.
    `,
    contact: {
      name: 'EduCore Technical Support',
      email: 'support@educore.dev'
    }
  },
  servers: [
    {
      url: '/',
      description: 'API Server Root'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT access token to authorize access to secure routes.'
      }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          name: { type: 'string', example: 'John Doe' },
          email: { type: 'string', example: 'john.doe@example.com' },
          role: { type: 'string', enum: ['learner', 'tutor', 'admin', 'super_admin', 'platform_owner'], example: 'learner' },
          status: { type: 'string', enum: ['active', 'pending_verification', 'pending_approval', 'banned', 'suspended'], example: 'active' },
          bio: { type: 'string', example: 'Learner passionate about full stack development.' },
          emailVerified: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time', example: '2026-05-27T15:18:18.000Z' }
        }
      },
      Course: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          title: { type: 'string', example: 'Introduction to Web Design' },
          slug: { type: 'string', example: 'introduction-to-web-design' },
          shortDescription: { type: 'string', example: 'Learn HTML, CSS, and dynamic styling basics.' },
          description: { type: 'string', example: 'A comprehensive starter course for learning clean modern web UI design principles.' },
          category: { type: 'string', example: 'Development' },
          level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'], example: 'Beginner' },
          language: { type: 'string', example: 'English' },
          price: { type: 'number', example: 49.99 },
          isFree: { type: 'boolean', example: false },
          visibility: { type: 'string', enum: ['public', 'private', 'unlisted'], example: 'public' },
          enrollmentCount: { type: 'number', example: 12 },
          averageRating: { type: 'number', example: 4.8 },
          reviewCount: { type: 'number', example: 5 },
          authorId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-05-27T15:18:18.000Z' }
        }
      },
      Module: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6d2aee5c3f8e5c2b3d9e8f1c' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          title: { type: 'string', example: 'Module 1: HTML Basics' },
          description: { type: 'string', example: 'Introduction to page structure, elements, and tag types.' },
          order: { type: 'integer', example: 1 },
          isPublished: { type: 'boolean', example: true }
        }
      },
      Lesson: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          moduleId: { type: 'string', example: '6d2aee5c3f8e5c2b3d9e8f1c' },
          title: { type: 'string', example: 'Lesson 1: Introduction to Semantic Elements' },
          description: { type: 'string', example: 'Understanding structural blocks like header, nav, section, and article.' },
          type: { type: 'string', enum: ['video', 'text', 'quiz', 'assignment', 'live_session'], example: 'video' },
          content: { type: 'string', example: 'Interactive semantic element overview content...' },
          videoUrl: { type: 'string', example: 'https://mux.com/playback/asset_id' },
          durationInMinutes: { type: 'number', example: 10 },
          isPreview: { type: 'boolean', example: true },
          isPublished: { type: 'boolean', example: true }
        }
      },
      Enrollment: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6f4aee5c3f8e5c2b3d9e8f1e' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          status: { type: 'string', enum: ['active', 'pending_payment', 'completed', 'cancelled'], example: 'active' },
          enrollmentType: { type: 'string', enum: ['free', 'paid'], example: 'free' },
          amountPaid: { type: 'number', example: 0 },
          enrolledAt: { type: 'string', format: 'date-time', example: '2026-05-27T15:18:18.000Z' }
        }
      },
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully.' },
          data: { type: 'object' }
        }
      },
      LiveSession: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6a1d2a91678778c03c344bc9' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          tutorId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          batchId: { type: 'string', nullable: true, example: '6b1aee5c3f8e5c2b3d9e8f1b' },
          title: { type: 'string', example: 'Live Doubt Clearing Session' },
          description: { type: 'string', example: 'Preparing questions for the midterm exam.' },
          provider: { type: 'string', enum: ['google_meet'], default: 'google_meet', example: 'google_meet' },
          meetingId: { type: 'string', example: '2m0dtp9f4jkoie012nr0ojjgpg' },
          meetingUrl: { type: 'string', example: 'https://meet.google.com/fkw-rbcr-rpn' },
          startTime: { type: 'string', format: 'date-time', example: '2026-06-02T20:59:00.000Z' },
          endTime: { type: 'string', format: 'date-time', example: '2026-06-02T21:59:00.000Z' },
          timezone: { type: 'string', example: 'Asia/Kolkata' },
          durationMinutes: { type: 'integer', example: 60 },
          status: { type: 'string', enum: ['scheduled', 'live', 'completed', 'cancelled', 'rescheduled'], example: 'scheduled' },
          enrolledSnapshotCount: { type: 'integer', example: 12 },
          attendanceEnabled: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time', example: '2026-06-01T15:18:18.000Z' }
        }
      },
      LiveRecording: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6b2d2a91678778c03c344bd0' },
          sessionId: { type: 'string', example: '6a1d2a91678778c03c344bc9' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          tutorId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          title: { type: 'string', example: 'Live Doubt Clearing Session Recording' },
          description: { type: 'string', example: 'Recording of Chapter 1 Doubt Clearing.' },
          provider: { type: 'string', enum: ['mux', 'cloudinary', 'external'], example: 'mux' },
          muxAssetId: { type: 'string', example: 'asset_id_xyz' },
          muxPlaybackId: { type: 'string', example: 'playback_id_abc' },
          streamUrl: { type: 'string', example: 'https://stream.mux.com/playback_id_abc.m3u8' },
          processingStatus: { type: 'string', enum: ['uploading', 'processing', 'ready', 'failed'], example: 'ready' },
          duration: { type: 'number', example: 3600 },
          uploadType: { type: 'string', enum: ['direct', 'external', 'google_drive', 'meet_recording'], example: 'direct' },
          status: { type: 'string', enum: ['draft', 'published', 'discarded'], example: 'published' },
          publishedAt: { type: 'string', format: 'date-time', example: '2026-06-01T16:00:00.000Z' }
        }
      },
      Progress: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344be1' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          completedLessons: { type: 'array', items: { type: 'string' }, example: ['6e3aee5c3f8e5c2b3d9e8f1d'] },
          completedLessonCount: { type: 'integer', example: 1 },
          lastAccessedLesson: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' },
          lessonProgress: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lessonId: { type: 'string' },
                watchTime: { type: 'number' },
                percentage: { type: 'number' },
                completed: { type: 'boolean' }
              }
            }
          },
          videoProgress: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lessonId: { type: 'string' },
                secondsWatched: { type: 'number' }
              }
            }
          },
          recordingProgress: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                recordingId: { type: 'string' },
                secondsWatched: { type: 'number' }
              }
            }
          }
        }
      },
      Note: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344be9' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          lessonId: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' },
          content: { type: 'string', example: 'This is a personal note about this lesson.' },
          videoTimestamp: { type: 'number', example: 125.5 },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344bf1' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          title: { type: 'string', example: 'New Lesson Uploaded' },
          message: { type: 'string', example: 'A new lesson "Semantic Elements" has been published.' },
          type: { type: 'string', enum: ['info', 'warning', 'success', 'error'], example: 'info' },
          read: { type: 'boolean', example: false },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c02' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          orderId: { type: 'string', example: 'order_PKpW5e7Y9hJ2n8' },
          paymentId: { type: 'string', example: 'pay_PKpW9k2F8e3N1m' },
          amount: { type: 'number', example: 49.99 },
          currency: { type: 'string', example: 'INR' },
          status: { type: 'string', enum: ['created', 'captured', 'failed'], example: 'captured' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Attendance: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c13' },
          sessionId: { type: 'string', example: '6a1d2a91678778c03c344bc9' },
          learnerId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          institutionId: { type: 'string', nullable: true, example: '6c3d2a91678778c03c344c68' },
          batchId: { type: 'string', nullable: true, example: '6b1aee5c3f8e5c2b3d9e8f1b' },
          joinedAt: { type: 'string', format: 'date-time' },
          leftAt: { type: 'string', format: 'date-time' },
          totalMinutes: { type: 'number', example: 45 },
          attendanceStatus: {
            type: 'string',
            enum: ['joined', 'partial', 'completed', 'present', 'absent', 'late'],
            example: 'present'
          },
          markedBy: { type: 'string', nullable: true, example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          markedAt: { type: 'string', format: 'date-time', nullable: true },
          note: { type: 'string', example: 'Joined after roll call.' }
        }
      },
      QuizAttempt: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c24' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          lessonId: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' },
          score: { type: 'number', example: 80 },
          passed: { type: 'boolean', example: true },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                questionId: { type: 'string' },
                selectedOptionId: { type: 'string' },
                isCorrect: { type: 'boolean' }
              }
            }
          },
          attemptedAt: { type: 'string', format: 'date-time' }
        }
      },
      Review: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c35' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
          title: { type: 'string', example: 'Amazing course!' },
          comment: { type: 'string', example: 'Highly recommend this course to anyone starting with React.' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Submission: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c46' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          lessonId: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' },
          fileUrl: { type: 'string', example: 'https://cloudinary.com/submission.pdf' },
          textAnswer: { type: 'string', example: 'Here is my text response to the prompt.' },
          status: { type: 'string', enum: ['submitted', 'graded'], example: 'submitted' },
          marksReceived: { type: 'number', example: 85 },
          feedback: { type: 'string', example: 'Good job, pay attention to styling details.' },
          submittedAt: { type: 'string', format: 'date-time' }
        }
      },
      Wishlist: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c57' },
          userId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
          addedAt: { type: 'string', format: 'date-time' }
        }
      },
      Institution: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6c3d2a91678778c03c344c68' },
          name: { type: 'string', example: 'Stanford University' },
          domain: { type: 'string', example: 'stanford.edu' },
          email: { type: 'string', example: 'admin@stanford.edu' },
          description: { type: 'string', example: 'Leading research university.' },
          status: { type: 'string', enum: ['active', 'suspended', 'pending'], example: 'active' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Batch: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6b1aee5c3f8e5c2b3d9e8f1b' },
          institutionId: { type: 'string', example: '6c3d2a91678778c03c344c68' },
          name: { type: 'string', example: 'Grade 10 - Batch A' },
          startDate: { type: 'string', format: 'date-time', example: '2026-07-01T00:00:00.000Z' },
          endDate: { type: 'string', format: 'date-time', example: '2026-12-31T00:00:00.000Z' },
          assignedTutorId: {
            oneOf: [
              { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
              { $ref: '#/components/schemas/User' }
            ],
            nullable: true
          },
          students: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userId: {
                  oneOf: [
                    { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
                    { $ref: '#/components/schemas/User' }
                  ]
                },
                addedAt: { type: 'string', format: 'date-time' },
                addedBy: { type: 'string', nullable: true }
              }
            }
          },
          studentCount: { type: 'integer', example: 32 },
          status: { type: 'string', enum: ['active', 'completed', 'archived'], example: 'active' },
          archivedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      TutorAssignment: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '6b2aee5c3f8e5c2b3d9e8f1c' },
          institutionId: { type: 'string', example: '6c3d2a91678778c03c344c68' },
          tutorId: {
            oneOf: [
              { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
              { $ref: '#/components/schemas/User' }
            ]
          },
          courseId: {
            oneOf: [
              { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
              { $ref: '#/components/schemas/Course' }
            ],
            nullable: true
          },
          batchId: {
            oneOf: [
              { type: 'string', example: '6b1aee5c3f8e5c2b3d9e8f1b' },
              { $ref: '#/components/schemas/Batch' }
            ],
            nullable: true
          },
          assignmentType: { type: 'string', enum: ['course', 'batch'], example: 'batch' },
          status: { type: 'string', enum: ['active', 'removed'], example: 'active' },
          assignedBy: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
          removedBy: { type: 'string', nullable: true },
          removedAt: { type: 'string', format: 'date-time', nullable: true },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      InstitutionDashboard: {
        type: 'object',
        properties: {
          kpis: {
            type: 'object',
            properties: {
              totalStudents: { type: 'integer', example: 320 },
              activeBatches: { type: 'integer', example: 8 },
              activeTutors: { type: 'integer', example: 14 },
              averageCompletionRate: { type: 'integer', example: 72 }
            }
          },
          recentEnrollmentActivity: {
            type: 'array',
            items: { $ref: '#/components/schemas/Enrollment' }
          },
          upcomingLiveSessions: {
            type: 'array',
            items: { $ref: '#/components/schemas/LiveSession' }
          },
          topPerformingCourses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                courseId: { type: 'string' },
                title: { type: 'string' },
                thumbnailUrl: { type: 'string', nullable: true },
                enrollmentCount: { type: 'integer' },
                averageCompletionRate: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  },
  paths: {
    // ======================================================
    // AUTHENTICATION SCOPE
    // ======================================================
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user account',
        description: 'Create a new learner or tutor account on the platform.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'confirmPassword', 'role'],
                properties: {
                  name: { type: 'string', example: 'Alice Smith' },
                  email: { type: 'string', example: 'alice.smith@example.com' },
                  password: { type: 'string', example: 'SecurePassword123' },
                  confirmPassword: { type: 'string', example: 'SecurePassword123' },
                  role: { type: 'string', enum: ['learner', 'tutor'], example: 'learner' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User registered successfully. Verification email initiated.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          },
          400: { description: 'Validation error: passwords do not match or fields invalid.' },
          409: { description: 'Conflict: Email address is already registered.' }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login user and receive JWT access token',
        description: 'Authenticates a user with email and password, establishing a session.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'alice.smith@example.com' },
                  password: { type: 'string', example: 'SecurePassword123' },
                  rememberMe: { type: 'boolean', example: false }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful. JWT token returned in cookies or headers.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          },
          401: { description: 'Unauthorized: Invalid email or password.' }
        }
      }
    },
    '/auth/verify-email': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify account email with OTP',
        description: 'Complete registration by verifying the OTP sent to the user email.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp'],
                properties: {
                  email: { type: 'string', example: 'alice.smith@example.com' },
                  otp: { type: 'string', example: '123456' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Email verified successfully.' },
          400: { description: 'Invalid or expired OTP.' }
        }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout current user session',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Session terminated successfully.' },
          401: { description: 'Unauthorized: Missing or invalid token.' }
        }
      }
    },


    // ======================================================
    // COURSE MANAGEMENT SCOPE
    // ======================================================
    '/api/v1/courses': {
      get: {
        tags: ['Courses'],
        summary: 'Retrieve courses catalogue with filtering',
        description: 'Get a list of active, published courses filtered by category, level, pricing, and search strings.',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Keyword matching titles' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Course category filtering' },
          { name: 'level', in: 'query', schema: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] } },
          { name: 'price', in: 'query', schema: { type: 'string', enum: ['free', 'paid'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
        ],
        responses: {
          200: {
            description: 'Course lists retrieved successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        courses: { type: 'array', items: { $ref: '#/components/schemas/Course' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Courses'],
        summary: 'Create a new course',
        description: 'Allows tutors or administrative users to initiate a new course structure.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description', 'category'],
                properties: {
                  title: { type: 'string', example: 'Mastering JavaScript Closures' },
                  description: { type: 'string', example: 'A deep-dive tutorial covering scope, execution context, and closures.' },
                  category: { type: 'string', example: 'Development' },
                  level: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'], example: 'Intermediate' },
                  price: { type: 'number', example: 0 },
                  isFree: { type: 'boolean', example: true }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Course created successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Course' } } }
          },
          403: { description: 'Forbidden: Only authorized roles can create courses.' }
        }
      }
    },
    '/api/v1/courses/{id}': {
      get: {
        tags: ['Courses'],
        summary: 'Get course details by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Course MongoDB ObjectId' }
        ],
        responses: {
          202: {
            description: 'Course details retrieved successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Course' } } }
          },
          404: { description: 'Course not found.' }
        }
      },
      patch: {
        tags: ['Courses'],
        summary: 'Update course info by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Mastering JavaScript Context & Closures' },
                  shortDescription: { type: 'string', example: 'Revised closures course curriculum.' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Course updated successfully.' },
          403: { description: 'Forbidden: Not the course author.' }
        }
      },
      delete: {
        tags: ['Courses'],
        summary: 'Soft delete course by ID',
        description: 'Marks a course as deleted by setting deletedAt and status=deleted. This endpoint does not hard-delete the course, curriculum, enrollments, progress, payments, or other historical records.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Course soft-deleted successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          },
          403: { description: 'Forbidden: Not authorized.' },
          404: { description: 'Course not found.' }
        }
      }
    },

    // ======================================================
    // MODULES & SECURE LESSONS SCOPE
    // ======================================================
    '/api/v1/modules': {
      post: {
        tags: ['Modules & Lessons'],
        summary: 'Create a new course module',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courseId', 'title'],
                properties: {
                  courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                  title: { type: 'string', example: 'Chapter 2: Variables & Core Scope' },
                  description: { type: 'string', example: 'Detailed scope block modules.' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Module created successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Module' } } }
          }
        }
      }
    },
    '/api/v1/lessons': {
      post: {
        tags: ['Modules & Lessons'],
        summary: 'Create a new lesson',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'courseId', 'moduleId', 'type'],
                properties: {
                  title: { type: 'string', example: 'Lesson 2: Execution Stack Basics' },
                  courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                  moduleId: { type: 'string', example: '6d2aee5c3f8e5c2b3d9e8f1c' },
                  type: { type: 'string', enum: ['video', 'text', 'quiz', 'assignment', 'live_session'], example: 'video' },
                  description: { type: 'string', example: 'How execution stacks operate.' },
                  content: { type: 'string', example: 'Detailed lesson text content...' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Lesson created successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Lesson' } } }
          }
        }
      }
    },

    // ======================================================
    // ENROLLMENT SCOPE
    // ======================================================
    '/api/v1/enrollments/{courseId}': {
      post: {
        tags: ['Enrollments'],
        summary: 'Enroll current logged-in user in a course',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          201: {
            description: 'User enrolled successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Enrollment' } } }
          },
          409: { description: 'User already enrolled in this course.' }
        }
      },
      delete: {
        tags: ['Enrollments'],
        summary: 'Cancel current user enrollment',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Enrollment cancelled and course removed successfully.' },
          403: { description: 'Forbidden: You cannot cancel paid course enrollments directly.' }
        }
      }
    },
    '/api/v1/enrollments/admin/bulk/{courseId}': {
      post: {
        tags: ['Enrollments'],
        summary: 'Bulk enroll students in a course (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['emails'],
                properties: {
                  emails: {
                    type: 'array',
                    items: { type: 'string', example: 'student1@example.com' }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk enrollment process completed.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        successful: { type: 'array', items: { type: 'object' } },
                        failed: { type: 'array', items: { type: 'object' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    // ======================================================
    // ADMINISTRATIVE USER MANAGEMENT SCOPE
    // ======================================================
    '/api/v1/admin/users': {
      get: {
        tags: ['Platform & Admin'],
        summary: 'List platform users (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: {
            description: 'Platform user list retrieved.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        users: { type: 'array', items: { $ref: '#/components/schemas/User' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/admin/users/{id}/ban': {
      patch: {
        tags: ['Platform & Admin'],
        summary: 'Restrict or restore user access (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['banned'],
                properties: {
                  banned: { type: 'boolean', example: true },
                  reason: { type: 'string', example: 'Violating platform guidelines.' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'User ban status updated successfully.' },
          400: { description: 'Security constraint: Demoting own account is denied.' }
        }
      }
    },
    '/api/v1/admin/users/{id}/role': {
      patch: {
        tags: ['Platform & Admin'],
        summary: 'Alter platform user access role (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['learner', 'tutor', 'admin'], example: 'tutor' },
                  reason: { type: 'string', example: 'Upgrading account level.' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'User role changed successfully.' }
        }
      }
    },
    '/api/v1/admin/users/bulk': {
      post: {
        tags: ['Platform & Admin'],
        summary: 'Bulk register new students (Admin)',
        description: 'Bulk register students in batches of up to 100.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['students'],
                properties: {
                  students: {
                    type: 'array',
                    maxItems: 100,
                    items: {
                      type: 'object',
                      required: ['name', 'email'],
                      properties: {
                        name: { type: 'string', example: 'John Doe' },
                        email: { type: 'string', example: 'john.doe@example.com' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk student registration completed.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    // ======================================================
    // LIVE SESSIONS SCOPE
    // ======================================================
    '/api/v1/live-sessions': {
      post: {
        tags: ['Live Sessions'],
        summary: 'Schedule a new live session (Tutor)',
        description: 'Tutors can schedule a real-time live session for their enrolled course students.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courseId', 'title', 'startTime', 'endTime', 'timezone', 'durationMinutes'],
                properties: {
                  courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                  batchId: { type: 'string', nullable: true, example: '6b1aee5c3f8e5c2b3d9e8f1b' },
                  title: { type: 'string', example: 'Doubt Clearing Session' },
                  description: { type: 'string', example: 'Answering questions before Chapter 1 test.' },
                  startTime: { type: 'string', format: 'date-time', example: '2026-06-02T20:59:00.000Z' },
                  endTime: { type: 'string', format: 'date-time', example: '2026-06-02T21:59:00.000Z' },
                  timezone: { type: 'string', example: 'Asia/Kolkata' },
                  durationMinutes: { type: 'integer', example: 60 }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Live session scheduled successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveSession' } } }
          },
          403: { description: 'Forbidden: Only the course author can schedule classes.' }
        }
      }
    },
    '/api/v1/live-sessions/my': {
      get: {
        tags: ['Live Sessions'],
        summary: 'Get scheduled sessions for current tutor',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Tutor sessions retrieved successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        sessions: { type: 'array', items: { $ref: '#/components/schemas/LiveSession' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/live-sessions/my-upcoming': {
      get: {
        tags: ['Live Sessions'],
        summary: 'Get upcoming sessions for enrolled courses (Learner)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'filter', in: 'query', schema: { type: 'string', enum: ['this_week', 'this_month', 'all'], default: 'this_week' } }
        ],
        responses: {
          200: {
            description: 'Learner upcoming sessions feed retrieved successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        sessions: { type: 'array', items: { $ref: '#/components/schemas/LiveSession' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/live-sessions/{id}': {
      get: {
        tags: ['Live Sessions'],
        summary: 'Get live session details by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Live session details retrieved successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveSession' } } }
          }
        }
      },
      patch: {
        tags: ['Live Sessions'],
        summary: 'Reschedule live session (Tutor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['startTime', 'endTime'],
                properties: {
                  batchId: { type: 'string', nullable: true, example: '6b1aee5c3f8e5c2b3d9e8f1b' },
                  title: { type: 'string', example: 'Updated Doubt Clearing Session' },
                  description: { type: 'string', example: 'Updated agenda.' },
                  startTime: { type: 'string', format: 'date-time', example: '2026-06-03T18:00:00.000Z' },
                  endTime: { type: 'string', format: 'date-time', example: '2026-06-03T19:00:00.000Z' },
                  timezone: { type: 'string', example: 'Asia/Kolkata' },
                  durationMinutes: { type: 'integer', example: 60 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Live session rescheduled and Google Meet updated successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveSession' } } }
          }
        }
      },
      delete: {
        tags: ['Live Sessions'],
        summary: 'Cancel live session (Tutor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Live session cancelled and Google Meet deleted successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveSession' } } }
          }
        }
      }
    },
    '/api/v1/live-sessions/{id}/join': {
      get: {
        tags: ['Live Sessions'],
        summary: 'Get join link for live session',
        description: 'Tutors and enrolled learners can retrieve the pre-authenticated Google Meet URL 10 minutes prior to session start.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Meeting join URL retrieved successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        meetingUrl: { type: 'string', example: 'https://meet.google.com/fkw-rbcr-rpn' }
                      }
                    }
                  }
                }
              }
            }
          },
          403: { description: 'Forbidden: Too early to join (join active 10 minutes before start time).' }
        }
      }
    },

    // ======================================================
    // LIVE RECORDINGS SCOPE
    // ======================================================
    '/api/v1/live-recordings/mux-upload-url': {
      post: {
        tags: ['Live Recordings'],
        summary: 'Request direct Mux video upload URL (Tutor)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'courseId'],
                properties: {
                  sessionId: { type: 'string', example: '6a1d2a91678778c03c344bc9' },
                  courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Mux upload URL and asset details generated.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        uploadId: { type: 'string', example: 'upload_id_123' },
                        url: { type: 'string', example: 'https://mux.com/direct-upload-endpoint-url' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/live-recordings/draft': {
      post: {
        tags: ['Live Recordings'],
        summary: 'Create a live recording draft (Tutor)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'courseId'],
                properties: {
                  sessionId: { type: 'string', example: '6a1d2a91678778c03c344bc9' },
                  courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                  title: { type: 'string', example: 'Doubt Session Recording' },
                  provider: { type: 'string', enum: ['mux', 'external'], default: 'mux' },
                  duration: { type: 'number', example: 3600 },
                  streamUrl: { type: 'string', example: 'https://drive.google.com/open?id=123' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Recording draft registered successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveRecording' } } }
          }
        }
      }
    },
    '/api/v1/live-recordings/{id}/publish': {
      post: {
        tags: ['Live Recordings'],
        summary: 'Publish draft recording to learners (Tutor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Recording published successfully and students notified.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveRecording' } } }
          }
        }
      }
    },
    '/api/v1/live-recordings/{id}': {
      delete: {
        tags: ['Live Recordings'],
        summary: 'Discard draft recording (Tutor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Recording draft removed and deleted from Mux.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LiveRecording' } } }
          }
        }
      }
    },
    '/api/v1/live-recordings/tutor/{courseId}': {
      get: {
        tags: ['Live Recordings'],
        summary: 'Get all draft and published recordings for a course (Tutor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Course recordings list retrieved.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/LiveRecording' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/live-recordings/course/{courseId}': {
      get: {
        tags: ['Live Recordings'],
        summary: 'Get active published course recordings with student watch offsets (Learner)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Learner course recordings list with progress offsets retrieved successfully.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/LiveRecording' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/live-recordings/{recordingId}/progress': {
      post: {
        tags: ['Live Recordings'],
        summary: 'Save recording watch position progress (Learner)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'recordingId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['watchTime'],
                properties: {
                  watchTime: { type: 'number', example: 120 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Recording watch progress saved successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Progress' } } }
          }
        }
      }
    },

    // ======================================================
    // PROGRESS TRACKING SCOPE
    // ======================================================
    '/api/v1/progress/{courseId}': {
      get: {
        tags: ['Progress Tracking'],
        summary: 'Get student progress document for course',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Progress state retrieved.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Progress' } } }
          }
        }
      }
    },
    '/api/v1/progress/{courseId}/complete': {
      post: {
        tags: ['Progress Tracking'],
        summary: 'Mark a lesson complete',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lessonId'],
                properties: {
                  lessonId: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Lesson marked complete and overall progress recalculated.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Progress' } } }
          }
        }
      }
    },
    '/api/v1/progress/{courseId}/video-progress': {
      post: {
        tags: ['Progress Tracking'],
        summary: 'Update student video watch progress and time (Debounced)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lessonId', 'secondsWatched', 'progressPercentage'],
                properties: {
                  lessonId: { type: 'string', example: '6e3aee5c3f8e5c2b3d9e8f1d' },
                  secondsWatched: { type: 'number', example: 45 },
                  progressPercentage: { type: 'number', example: 15 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Video watch progress updated successfully.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Progress' } } }
          }
        }
      }
    }
  }
};

const extraPaths = require('./swaggerPaths');

for (const [apiPath, operations] of Object.entries(extraPaths)) {
  swaggerSpec.paths[apiPath] = {
    ...(swaggerSpec.paths[apiPath] || {}),
    ...operations
  };
}

const authAliases = {
  '/api/v1/auth/register': '/auth/register',
  '/api/v1/auth/verify-email': '/auth/verify-email',
  '/api/v1/auth/resend-otp': '/auth/resend-otp',
  '/api/v1/auth/login': '/auth/login',
  '/api/v1/auth/forgot-password': '/auth/forgot-password',
  '/api/v1/auth/password-reset-cookie': '/auth/password-reset-cookie',
  '/api/v1/auth/reset-password': '/auth/reset-password',
  '/api/v1/auth/refresh-token': '/auth/refresh-token',
  '/api/v1/auth/logout': '/auth/logout'
};

for (const [aliasPath, sourcePath] of Object.entries(authAliases)) {
  swaggerSpec.paths[aliasPath] = swaggerSpec.paths[sourcePath];
}

delete swaggerSpec.paths['/api/v1/courses'].get;
delete swaggerSpec.paths['/api/v1/modules'];
delete swaggerSpec.paths['/api/v1/lessons'];

module.exports = swaggerSpec;
