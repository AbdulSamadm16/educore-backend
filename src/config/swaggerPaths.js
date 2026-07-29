const swaggerPaths = {
  // ======================================================
  // AUTHENTICATION EXPANSION
  // ======================================================
  '/auth/resend-otp': {
    post: {
      tags: ['Authentication'],
      summary: 'Resend email verification OTP',
      description: 'Trigger a new OTP to be sent to the user email for registration verification.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'alice.smith@example.com' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'OTP sent successfully.' },
        400: { description: 'Bad request.' }
      }
    }
  },
  '/auth/forgot-password': {
    post: {
      tags: ['Authentication'],
      summary: 'Request password reset OTP/link',
      description: 'Generates a secure password reset token and sends it to the registered email address.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'alice.smith@example.com' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password reset link sent successfully.' },
        404: { description: 'Email not found.' }
      }
    }
  },
  '/auth/password-reset-cookie': {
    get: {
      tags: ['Authentication'],
      summary: 'Set password reset token cookie',
      description: 'Validates password reset token and sets a secure cookie on the client browser, redirecting the user to the reset page.',
      parameters: [
        { name: 'token', in: 'query', required: true, schema: { type: 'string' }, description: 'Reset token' },
        { name: 'redirectTo', in: 'query', schema: { type: 'string', default: '/reset-password' } }
      ],
      responses: {
        302: { description: 'Redirect to password reset screen with cookie set.' },
        400: { description: 'Invalid or expired token.' }
      }
    }
  },
  '/auth/reset-password': {
    post: {
      tags: ['Authentication'],
      summary: 'Reset account password',
      description: 'Consumes reset token to assign a new password to the user account.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password', 'confirmPassword'],
              properties: {
                token: { type: 'string', example: 'd3b07384d113edec49eaa6238ad5ff00...' },
                password: { type: 'string', example: 'NewSecure123' },
                confirmPassword: { type: 'string', example: 'NewSecure123' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password reset completed successfully.' },
        400: { description: 'Invalid token or mismatch passwords.' }
      }
    }
  },
  '/auth/refresh-token': {
    post: {
      tags: ['Authentication'],
      summary: 'Refresh JWT access tokens',
      description: 'Refresh the current session access token using a valid refresh token.',
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Token refreshed successfully.' },
        401: { description: 'Refresh token invalid or expired.' }
      }
    }
  },

  // ======================================================
  // USER PROFILES
  // ======================================================
  '/api/v1/users/me': {
    get: {
      tags: ['Users & Profile'],
      summary: 'Retrieve logged-in user profile info',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Profile information retrieved.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
        },
        401: { description: 'Unauthorized.' }
      }
    },
    put: {
      tags: ['Users & Profile'],
      summary: 'Update logged-in user profile info',
      description: 'Allows updating name, bio, and avatar. Supporting multipart/form-data for avatar files.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'John Smith' },
                bio: { type: 'string', example: 'LMS Creator.' },
                avatar: { type: 'string', format: 'binary', description: 'User profile image file' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Profile updated successfully.' },
        400: { description: 'Validation error.' }
      }
    }
  },
  '/api/v1/users/change-email': {
    put: {
      tags: ['Users & Profile'],
      summary: 'Request email change',
      description: 'Initiate a change of primary email address. Requires current password verification.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'currentPassword'],
              properties: {
                email: { type: 'string', format: 'email', example: 'new.email@example.com' },
                currentPassword: { type: 'string', example: 'SecurePassword123' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Verification OTP sent to new email.' },
        400: { description: 'Incorrect current password or invalid email.' }
      }
    }
  },
  '/api/v1/users/verify-email-change': {
    post: {
      tags: ['Users & Profile'],
      summary: 'Verify email change OTP',
      description: 'Validates OTP sent to new email and updates email address on profile.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['otp'],
              properties: {
                otp: { type: 'string', example: '123456' },
                refreshToken: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Email updated successfully.' },
        400: { description: 'Invalid or expired OTP.' }
      }
    }
  },
  '/api/v1/users/change-password': {
    put: {
      tags: ['Users & Profile'],
      summary: 'Change account password',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword', 'confirmPassword'],
              properties: {
                currentPassword: { type: 'string', example: 'SecurePassword123' },
                newPassword: { type: 'string', example: 'NewPassword123' },
                confirmPassword: { type: 'string', example: 'NewPassword123' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password changed successfully.' },
        400: { description: 'Invalid password criteria or mismatch.' }
      }
    }
  },
  '/api/v1/users/me/notification-settings': {
    get: {
      tags: ['Users & Profile'],
      summary: 'Get current user notification preferences',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Notification settings retrieved successfully.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Notification settings retrieved successfully.' },
                  data: {
                    type: 'object',
                    properties: {
                      notificationSettings: {
                        type: 'object',
                        properties: {
                          enrollmentConfirmed: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                          newLesson: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                          liveClassReminder: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                          assignmentGraded: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                          quizResult: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                          paymentSuccess: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                          newStudentEnrolled: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized.' },
        404: { description: 'User not found.' }
      }
    },
    patch: {
      tags: ['Users & Profile'],
      summary: 'Update current user notification preferences',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                enrollmentConfirmed: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                newLesson: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                liveClassReminder: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                assignmentGraded: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                quizResult: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                paymentSuccess: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } },
                newStudentEnrolled: { type: 'object', properties: { email: { type: 'boolean' }, inApp: { type: 'boolean' } } }
              },
              example: {
                liveClassReminder: { email: true, inApp: true },
                assignmentGraded: { email: true, inApp: false }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Notification settings updated successfully.' },
        400: { description: 'Validation error.' },
        401: { description: 'Unauthorized.' },
        404: { description: 'User not found.' }
      }
    }
  },

  // ======================================================
  // PLATFORM & ADMINISTRATION
  // ======================================================
  '/api/v1/platform/auth/login': {
    post: {
      tags: ['Platform & Admin'],
      summary: 'Platform Owner login',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'owner@educore.dev' },
                password: { type: 'string', example: 'OwnerPassword123' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Owner login successful.' },
        401: { description: 'Unauthorized.' }
      }
    }
  },
  '/api/v1/platform/auth/forgot-password': {
    post: {
      tags: ['Platform & Admin'],
      summary: 'Platform Owner forgot password',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Reset email triggered.' }
      }
    }
  },
  '/api/v1/platform/auth/password-reset-cookie': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'Platform Owner set password reset cookie',
      parameters: [
        { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'redirectTo', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        302: { description: 'Redirect with token cookie.' }
      }
    }
  },
  '/api/v1/platform/auth/reset-password': {
    post: {
      tags: ['Platform & Admin'],
      summary: 'Platform Owner reset password',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password', 'confirmPassword'],
              properties: {
                token: { type: 'string' },
                password: { type: 'string' },
                confirmPassword: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Password reset successfully.' }
      }
    }
  },
  '/api/v1/platform/auth/refresh-token': {
    post: {
      tags: ['Platform & Admin'],
      summary: 'Platform Owner refresh JWT',
      requestBody: {
        content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } }
      },
      responses: {
        200: { description: 'Tokens refreshed.' }
      }
    }
  },
  '/api/v1/platform/auth/logout': {
    post: {
      tags: ['Platform & Admin'],
      summary: 'Platform Owner logout',
      responses: {
        200: { description: 'Logged out successfully.' }
      }
    }
  },
  '/api/v1/platform/users': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'List users with platform roles (Platform Owner)',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'role', in: 'query', schema: { type: 'string', enum: ['learner', 'tutor', 'admin', 'super_admin', 'platform_owner'] } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'pending_verification', 'pending_approval', 'banned', 'suspended'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Users list retrieved.' }
      }
    }
  },
  '/api/v1/platform/users/{id}/ban': {
    patch: {
      tags: ['Platform & Admin'],
      summary: 'Restrict platform user access (Platform Owner)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['banned'], properties: { banned: { type: 'boolean' }, reason: { type: 'string' } } } } }
      },
      responses: {
        200: { description: 'Ban status updated.' }
      }
    }
  },
  '/api/v1/platform/users/{id}/role': {
    patch: {
      tags: ['Platform & Admin'],
      summary: 'Update platform user access role (Platform Owner)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string' }, reason: { type: 'string' } } } } }
      },
      responses: {
        200: { description: 'Role changed.' }
      }
    }
  },
  '/api/v1/platform/users/{id}': {
    delete: {
      tags: ['Platform & Admin'],
      summary: 'Soft delete platform user (Platform Owner)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'User soft-deleted successfully.' }
      }
    }
  },
  '/api/v1/platform/institutions': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'List Institutions (Platform Owner)',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'suspended', 'pending'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Institutions list retrieved.' }
      }
    },
    post: {
      tags: ['Platform & Admin'],
      summary: 'Create a new Institution (Platform Owner)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'domain', 'email', 'adminName', 'adminEmail'],
              properties: {
                name: { type: 'string', example: 'Educore University' },
                domain: { type: 'string', example: 'educore.edu' },
                email: { type: 'string', example: 'contact@educore.edu' },
                description: { type: 'string', example: 'Private instance University.' },
                adminName: { type: 'string', example: 'Dean Smith' },
                adminEmail: { type: 'string', example: 'dean.smith@educore.edu' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Institution created successfully.' }
      }
    }
  },
  '/api/v1/platform/analytics': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'Get Platform Revenue and User Analytics (Platform Owner)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Platform analytics retrieved.' }
      }
    }
  },
  '/api/v1/platform/analytics/export': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'Export Platform Revenue Dashboard (Platform Owner)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'CSV Analytics download triggered.' }
      }
    }
  },
  '/api/v1/admin/users': {
    post: {
      tags: ['Platform & Admin'],
      summary: 'Create user manually (Admin)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'role'],
              properties: {
                name: { type: 'string', example: 'David Warner' },
                email: { type: 'string', example: 'david@example.com' },
                role: { type: 'string', enum: ['learner', 'tutor', 'admin'], example: 'tutor' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'User created and credentials emailed.' }
      }
    }
  },
  '/api/v1/admin/users/{id}/approve-tutor': {
    patch: {
      tags: ['Platform & Admin'],
      summary: 'Approve tutor registration application (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Tutor account approved and set to active.' }
      }
    }
  },
  '/api/v1/admin/email-logs': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'List recent platform email dispatch logs (Admin)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Logs retrieved successfully.' }
      }
    }
  },
  '/api/v1/admin/analytics': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'Get admin-level dashboard analytics (Admin)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Analytics retrieved.' }
      }
    }
  },
  '/api/v1/admin/analytics/export': {
    get: {
      tags: ['Platform & Admin'],
      summary: 'Export Admin Revenue CSV (Admin)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'CSV file download.' }
      }
    }
  },
  '/api/v1/admin/users/{id}': {
    delete: {
      tags: ['Platform & Admin'],
      summary: 'Soft delete user (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'User soft-deleted successfully.' }
      }
    }
  },

  // ======================================================
  // COURSES EXPANSION
  // ======================================================
  '/api/v1/courses/my-courses': {
    get: {
      tags: ['Courses'],
      summary: 'Retrieve courses authored by logged-in tutor',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Authored courses retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Course' } } } }
        }
      }
    }
  },
  '/api/v1/courses/tutor/analytics': {
    get: {
      tags: ['Courses'],
      summary: 'Get tutor course analytics dashboard data',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'query', schema: { type: 'string' }, description: 'Optional course id to focus selected course analytics.' }
      ],
      responses: {
        200: {
          description: 'Tutor analytics retrieved successfully.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Tutor analytics retrieved successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      courses: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                            title: { type: 'string', example: 'Introduction to Web Design' }
                          }
                        }
                      },
                      overallWatchTime: { type: 'number', example: 42.5 },
                      engagementScore: { type: 'integer', example: 76 },
                      enrollmentTrend: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            month: { type: 'string', example: 'Jun 2026' },
                            enrollments: { type: 'integer', example: 12 }
                          }
                        }
                      },
                      courseStats: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                            title: { type: 'string', example: 'Introduction to Web Design' },
                            enrollmentCount: { type: 'integer', example: 25 },
                            avgCompletionRate: { type: 'integer', example: 68 }
                          }
                        }
                      },
                      selectedCourseAnalytics: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                          title: { type: 'string', example: 'Introduction to Web Design' },
                          enrollmentCount: { type: 'integer', example: 25 },
                          completionRate: { type: 'integer', example: 68 },
                          watchTimeHours: { type: 'number', example: 18.4 },
                          lessonDropOffs: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                lessonId: { type: 'string' },
                                title: { type: 'string' },
                                type: { type: 'string' },
                                order: { type: 'integer' },
                                completedCount: { type: 'integer' },
                                dropOffRate: { type: 'integer' }
                              }
                            }
                          },
                          quizStats: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                lessonId: { type: 'string' },
                                title: { type: 'string' },
                                attemptsCount: { type: 'integer' },
                                avgScore: { type: 'integer' }
                              }
                            }
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
        401: { description: 'Unauthorized.' }
      }
    }
  },
  '/api/v1/courses/catalogue': {
    get: {
      tags: ['Courses'],
      summary: 'Retrieve all cataloged published courses',
      description: 'Browsing endpoint supporting search queries, category tags, level filters, rating options, sorting, and pagination.',
      parameters: [
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'category', in: 'query', schema: { type: 'string' } },
        { name: 'level', in: 'query', schema: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced'] } },
        { name: 'price', in: 'query', schema: { type: 'string', enum: ['free', 'paid'] } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'latest', 'popular', 'rating', 'price_low', 'price_high'] } },
        { name: 'rating', in: 'query', schema: { type: 'number' } },
        { name: 'featured', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
      ],
      responses: {
        200: { description: 'Catalogue list retrieved.' }
      }
    }
  },
  '/api/v1/courses/{courseId}/curriculum': {
    get: {
      tags: ['Courses'],
      summary: 'Get course syllabus outline curriculum',
      description: 'Retrieve course modules and secure lessons structure (for enrolled students).',
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Syllabus modules and details retrieved.' }
      }
    }
  },
  '/api/v1/courses/{courseId}/preview-curriculum': {
    get: {
      tags: ['Courses'],
      summary: 'Get course preview syllabus outline',
      description: 'Retrieve public/free previews of lessons within modules (for landing pages).',
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Public syllabus components fetched.' }
      }
    }
  },
  '/api/v1/courses/admin/all': {
    get: {
      tags: ['Courses'],
      summary: 'List all course records (Admin)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'List of all system courses.' }
      }
    }
  },
  '/api/v1/courses/{id}/approve': {
    patch: {
      tags: ['Courses'],
      summary: 'Approve course publication request (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course request approved.' }
      }
    }
  },
  '/api/v1/courses/{id}/publish': {
    patch: {
      tags: ['Courses'],
      summary: 'Publish course modifications to production (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course set to published or pending administrative approval.' }
      }
    }
  },
  '/api/v1/courses/{id}/unpublish': {
    patch: {
      tags: ['Courses'],
      summary: 'Take course offline (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course status unpublished.' }
      }
    }
  },
  '/api/v1/courses/{id}/discard': {
    patch: {
      tags: ['Courses'],
      summary: 'Discard course drafts changes (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course drafts discarded and reset to published state.' }
      }
    }
  },
  '/api/v1/courses/{id}/submit-for-review': {
    patch: {
      tags: ['Courses'],
      summary: 'Submit a course for administrative review',
      description: 'Moves a draft or updated course into review_pending status and notifies reviewers.',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Course submitted for review successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Course' } } }
        },
        400: { description: 'Published courses cannot be submitted for review.' },
        401: { description: 'Unauthorized.' },
        403: { description: 'Not authorized to submit this course.' },
        404: { description: 'Course not found.' }
      }
    }
  },
  '/api/v1/courses/{id}/feature': {
    patch: {
      tags: ['Courses'],
      summary: 'Toggle system-featured badge status (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Featured status updated.' }
      }
    }
  },
  '/api/v1/courses/{id}/suspend': {
    patch: {
      tags: ['Courses'],
      summary: 'Suspend course visibility (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course suspended.' }
      }
    }
  },
  '/api/v1/courses/{id}/unsuspend': {
    patch: {
      tags: ['Courses'],
      summary: 'Restore suspended course (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course suspension removed.' }
      }
    }
  },
  '/api/v1/courses/{id}/publish-readiness': {
    get: {
      tags: ['Courses'],
      summary: 'Evaluate readiness checks to publish course',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Calculated readiness errors and passes status report.' }
      }
    }
  },
  '/api/v1/courses/{id}/stats': {
    get: {
      tags: ['Courses'],
      summary: 'Get course engagement metrics & enrollment count stats',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Stats payload.' }
      }
    }
  },
  '/api/v1/courses/{id}/audit-logs': {
    get: {
      tags: ['Courses'],
      summary: 'Get course revision audit history logs (Tutor/Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Logs retrieved.' }
      }
    }
  },
  '/api/v1/courses/{id}/thumbnail': {
    patch: {
      tags: ['Courses'],
      summary: 'Upload course cover image thumbnail',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['thumbnail'],
              properties: {
                thumbnail: { type: 'string', format: 'binary', description: 'Cover image file upload' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Thumbnail uploaded and updated successfully.' }
      }
    }
  },

  // ======================================================
  // ENROLLMENTS EXPANSION
  // ======================================================
  '/api/v1/enrollments/tutor/students': {
    get: {
      tags: ['Enrollments'],
      summary: 'Get learners enrolled in the tutor courses',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Learner profile listing retrieved.' }
      }
    }
  },
  '/api/v1/enrollments/my-courses': {
    get: {
      tags: ['Enrollments'],
      summary: 'Get current user active course enrollments',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
      ],
      responses: {
        200: { description: 'List of active course enrollments.' }
      }
    }
  },
  '/api/v1/enrollments/check/{courseId}': {
    get: {
      tags: ['Enrollments'],
      summary: 'Check if current user is enrolled in a specific course',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Returns boolean status indicating enrollment status.' }
      }
    }
  },

  // ======================================================
  // MODULES & LESSONS EXPANSION
  // ======================================================
  '/api/v1/modules/reorder': {
    patch: {
      tags: ['Modules & Lessons'],
      summary: 'Update sequential layout order of modules (Tutor)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['courseId', 'orderedModuleIds'],
              properties: {
                courseId: { type: 'string' },
                orderedModuleIds: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Modules reordered successfully.' }
      }
    }
  },
  '/api/v1/modules/{courseId}': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Create a new course module under a parent course',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', example: 'Module 1: Introduction' },
                description: { type: 'string', example: 'Module scope description.' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Module created successfully.' }
      }
    }
  },
  '/api/v1/modules/{id}': {
    patch: {
      tags: ['Modules & Lessons'],
      summary: 'Update module content data details (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                isPublished: { type: 'boolean' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Module updated successfully.' }
      }
    },
    delete: {
      tags: ['Modules & Lessons'],
      summary: 'Delete module and clean references (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Module deleted successfully.' }
      }
    }
  },
  '/api/v1/lessons/video/webhook': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Unauthenticated webhook receiver for Mux video processing state updates',
      responses: {
        200: { description: 'Webhook events parsed.' }
      }
    }
  },
  '/api/v1/lessons/{id}/video/stream': {
    get: {
      tags: ['Modules & Lessons'],
      summary: 'Securely play video content',
      description: 'Generates secure temporary Mux streams, preventing downloading raw videos.',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'token', in: 'query', required: true, schema: { type: 'string' }, description: 'One-time secure play token' }
      ],
      responses: {
        200: { description: 'Mux stream playback credentials retrieved.' }
      }
    }
  },
  '/api/v1/lessons/reorder': {
    patch: {
      tags: ['Modules & Lessons'],
      summary: 'Update sequential lesson order inside a module (Tutor)',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['moduleId', 'orderedLessonIds'],
              properties: {
                moduleId: { type: 'string' },
                orderedLessonIds: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Lessons reordered.' }
      }
    }
  },
  '/api/v1/lessons/module/{moduleId}': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Create a new lesson within a module (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'moduleId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'type'],
              properties: {
                title: { type: 'string', example: 'Sementic HTML5 tags' },
                type: { type: 'string', enum: ['video', 'text', 'quiz', 'assignment', 'live_session'], example: 'video' },
                description: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Lesson created.' }
      }
    }
  },
  '/api/v1/lessons/{id}': {
    get: {
      tags: ['Modules & Lessons'],
      summary: 'Get lesson details by ID',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Lesson details retrieved.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Lesson' } } }
        }
      }
    },
    patch: {
      tags: ['Modules & Lessons'],
      summary: 'Modify lesson content details (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                content: { type: 'string' },
                isPreview: { type: 'boolean' },
                isPublished: { type: 'boolean' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Lesson updated.' }
      }
    },
    delete: {
      tags: ['Modules & Lessons'],
      summary: 'Remove lesson record (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Lesson deleted.' }
      }
    }
  },
  '/api/v1/lessons/{id}/video/upload-init': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Initialize resumable video chunk upload session (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Session initialized. Returns secure upload token identifiers.' }
      }
    }
  },
  '/api/v1/lessons/{id}/video/upload-status': {
    get: {
      tags: ['Modules & Lessons'],
      summary: 'Query status of video upload session chunks (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Returns chunk indices uploaded successfully so far.' }
      }
    }
  },
  '/api/v1/lessons/{id}/video/upload-chunk': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Upload a single chunk of video binary (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['chunk'],
              properties: {
                chunk: { type: 'string', format: 'binary', description: 'Chunk index data file binary blob' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Chunk saved.' }
      }
    }
  },
  '/api/v1/lessons/{id}/video/upload-complete': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Finalize resumable upload process & start processing transcoding tasks (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Processing jobs initiated in background.' }
      }
    }
  },
  '/api/v1/lessons/{id}/attachments': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Attach document reference (PDF, images, zip) to lesson (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['attachment'],
              properties: {
                attachment: { type: 'string', format: 'binary', description: 'Support asset document file binary' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Attachment created.' }
      }
    }
  },
  '/api/v1/lessons/{id}/attachments/{attachmentId}': {
    delete: {
      tags: ['Modules & Lessons'],
      summary: 'Remove attachment from lesson (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Attachment deleted.' }
      }
    },
    put: {
      tags: ['Modules & Lessons'],
      summary: 'Replace attachment asset binary file in lesson (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['attachment'],
              properties: {
                attachment: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Attachment replaced.' }
      }
    }
  },
  '/api/v1/lessons/{id}/subtitles': {
    post: {
      tags: ['Modules & Lessons'],
      summary: 'Upload subtitle file (.vtt or .srt) (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['subtitle'],
              properties: {
                subtitle: { type: 'string', format: 'binary', description: 'VTT/SRT text tracks file binary' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Subtitles uploaded.' }
      }
    },
    delete: {
      tags: ['Modules & Lessons'],
      summary: 'Remove subtitle track file from lesson (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Subtitles removed.' }
      }
    }
  },

  // ======================================================
  // LIVE SESSIONS EXPANSION
  // ======================================================
  '/api/v1/live-sessions/course/{courseId}': {
    get: {
      tags: ['Live Sessions'],
      summary: 'Get scheduled live sessions for a course',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Live sessions retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/LiveSession' } } } }
        }
      }
    }
  },

  // ======================================================
  // MUX VIDEO INTEGRATION
  // ======================================================
  '/api/v1/mux/webhooks': {
    post: {
      tags: ['Mux Video'],
      summary: 'Mux integration webhooks status listener',
      responses: {
        200: { description: 'Webhook resolved.' }
      }
    }
  },
  '/api/v1/mux/upload-url': {
    post: {
      tags: ['Mux Video'],
      summary: 'Create secure direct Mux upload URL',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Mux upload URL created.' }
      }
    }
  },
  '/api/v1/mux/uploads/{uploadId}': {
    get: {
      tags: ['Mux Video'],
      summary: 'Check state of Mux upload session',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'uploadId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Processing state retrieved.' }
      }
    }
  },

  // ======================================================
  // LEARNER PROGRESS ANALYTICS
  // ======================================================
  '/api/v1/progress/learner/analytics': {
    get: {
      tags: ['Progress Tracking'],
      summary: 'Get learner-wide progress analytics dashboard data',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Learner analytics fetched successfully.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Learner analytics fetched successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      totalHoursWatched: { type: 'number', example: 18.5 },
                      coursesCount: {
                        type: 'object',
                        properties: {
                          inProgress: { type: 'integer', example: 3 },
                          completed: { type: 'integer', example: 2 }
                        }
                      },
                      quizAverage: { type: 'integer', example: 84 },
                      streak: {
                        type: 'object',
                        properties: {
                          currentStreak: { type: 'integer', example: 5 },
                          maxStreak: { type: 'integer', example: 14 },
                          activeDaysCount: { type: 'integer', example: 22 }
                        }
                      },
                      activityHeatmap: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            day: { type: 'integer', minimum: 0, maximum: 6, example: 1 },
                            hour: { type: 'integer', minimum: 0, maximum: 23, example: 20 },
                            count: { type: 'integer', example: 4 }
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
        401: { description: 'Unauthorized.' }
      }
    }
  },

  // ======================================================
  // PERSONAL NOTES
  // ======================================================
  '/api/v1/notes': {
    get: {
      tags: ['Notes'],
      summary: 'Get user private notes list',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Notes list retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Note' } } } }
        }
      }
    },
    post: {
      tags: ['Notes'],
      summary: 'Create or save notes reference',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['lessonId', 'content'],
              properties: {
                lessonId: { type: 'string' },
                content: { type: 'string', example: 'This is my review note.' },
                videoTimestamp: { type: 'number', example: 120 }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Note created.' }
      }
    }
  },
  '/api/v1/notes/{id}': {
    put: {
      tags: ['Notes'],
      summary: 'Modify note content text details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Note text updated successfully.' }
      }
    },
    delete: {
      tags: ['Notes'],
      summary: 'Delete user note reference',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Note deleted.' }
      }
    }
  },

  // ======================================================
  // REAL-TIME NOTIFICATIONS
  // ======================================================
  '/api/v1/notifications/stream': {
    get: {
      tags: ['Notifications'],
      summary: 'Open continuous real-time SSE stream channel connection',
      description: 'Establishes a connection to stream notifications in real time. Can send token in cookies or query param: ?token=XYZ',
      parameters: [
        { name: 'token', in: 'query', schema: { type: 'string' }, description: 'Access token fallback' }
      ],
      responses: {
        200: { description: 'Connection established. Stream keeps open using text/event-stream.' }
      }
    }
  },
  '/api/v1/notifications': {
    get: {
      tags: ['Notifications'],
      summary: 'Retrieve user notification listing feed',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' }, description: 'Query for paging support' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: {
          description: 'Feed list retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Notification' } } } }
        }
      }
    }
  },
  '/api/v1/notifications/{id}/read': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark single notification read status',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Marked read.' }
      }
    }
  },
  '/api/v1/notifications/read-all': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark all notification list inbox as read',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Read status synced successfully.' }
      }
    }
  },

  // ======================================================
  // PAYMENTS & INVOICES
  // ======================================================
  '/api/v1/payments/webhook/razorpay': {
    post: {
      tags: ['Payments'],
      summary: 'Razorpay webhook listener interface',
      responses: {
        200: { description: 'Webhook updates resolved.' }
      }
    }
  },
  '/api/v1/payments/verify': {
    post: {
      tags: ['Payments'],
      summary: 'Verify transaction signatures and confirm order complete',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
              properties: {
                razorpay_order_id: { type: 'string' },
                razorpay_payment_id: { type: 'string' },
                razorpay_signature: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Signature validated and enrollment activated.' }
      }
    }
  },
  '/api/v1/payments/history': {
    get: {
      tags: ['Payments'],
      summary: 'Get user payment logs history',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'List of logs.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Payment' } } } }
        }
      }
    }
  },
  '/api/v1/payments/by-order/{orderId}': {
    get: {
      tags: ['Payments'],
      summary: 'Find transaction record using Razorpay Order ID reference',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Payment object matched.' }
      }
    }
  },
  '/api/v1/payments/{id}/invoice': {
    get: {
      tags: ['Payments'],
      summary: 'Download printable PDF billing invoice for payment',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'PDF binary stream returned.' }
      }
    }
  },

  // ======================================================
  // ATTENDANCE TRACKING
  // ======================================================
  '/api/v1/attendance/{id}/join': {
    post: {
      tags: ['Attendance'],
      summary: 'Log joining a live session by session ID',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Join timestamp saved.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Attendance' } } }
        },
        400: { description: 'Session ID is missing or invalid.' },
        403: { description: 'Learner is not enrolled or not in the linked batch.' },
        404: { description: 'Session not found.' }
      }
    }
  },
  '/api/v1/attendance/{id}/leave': {
    post: {
      tags: ['Attendance'],
      summary: 'Log leaving a live session by session ID',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Leave timestamp saved and duration recalculated.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Attendance' } } }
        },
        400: { description: 'Session ID is missing or invalid.' },
        404: { description: 'Attendance record not found.' }
      }
    }
  },
  '/api/v1/attendance/{id}': {
    get: {
      tags: ['Attendance'],
      summary: 'List attendance records for a live session by session ID (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Attendance records retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Attendance' } } } }
        },
        403: { description: 'Tutor does not own the session.' }
      }
    }
  },
  '/api/v1/attendance/join': {
    post: {
      tags: ['Attendance'],
      summary: 'Log joining live session',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['sessionId'],
              properties: {
                sessionId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Joined log timestamp saved.' }
      }
    }
  },
  '/api/v1/attendance/leave': {
    post: {
      tags: ['Attendance'],
      summary: 'Log leaving live session',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['sessionId'],
              properties: {
                sessionId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Left log saved. Duration minutes computed.' }
      }
    }
  },
  '/api/v1/attendance': {
    get: {
      tags: ['Attendance'],
      summary: 'List attendance history records for session (Tutors)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Logs retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Attendance' } } } }
        }
      }
    }
  },

  // ======================================================
  // INSTITUTION MANAGEMENT
  // ======================================================
  '/api/v1/institution/dashboard': {
    get: {
      tags: ['Institution Management'],
      summary: 'Get institution admin dashboard overview',
      description: 'Returns institution-scoped KPIs, recent enrollment activity, upcoming batch live sessions, and top performing courses.',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Institution dashboard retrieved successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/InstitutionDashboard' } } }
        },
        403: { description: 'Admin account is not linked to an institution.' }
      }
    }
  },
  '/api/v1/institution/batches': {
    get: {
      tags: ['Institution Management'],
      summary: 'List institution batches',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'completed', 'archived'] } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } }
      ],
      responses: {
        200: {
          description: 'Batches retrieved successfully.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  batches: { type: 'array', items: { $ref: '#/components/schemas/Batch' } },
                  pagination: { type: 'object' }
                }
              }
            }
          }
        }
      }
    },
    post: {
      tags: ['Institution Management'],
      summary: 'Create a student batch',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'startDate', 'endDate'],
              properties: {
                name: { type: 'string', example: 'Grade 10 - Batch A' },
                startDate: { type: 'string', format: 'date-time', example: '2026-07-01T00:00:00.000Z' },
                endDate: { type: 'string', format: 'date-time', example: '2026-12-31T00:00:00.000Z' },
                assignedTutorId: { type: 'string', nullable: true, example: '6a0aee5c3f8e5c2b3d9e8f1a' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Batch created successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } }
        },
        400: { description: 'Validation error.' },
        404: { description: 'Assigned tutor not found in this institution.' }
      }
    }
  },
  '/api/v1/institution/batches/{batchId}': {
    get: {
      tags: ['Institution Management'],
      summary: 'Get batch details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Batch retrieved successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } }
        },
        404: { description: 'Batch not found.' }
      }
    },
    patch: {
      tags: ['Institution Management'],
      summary: 'Update batch details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', example: 'Grade 10 - Batch B' },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
                assignedTutorId: { type: 'string', nullable: true },
                status: { type: 'string', enum: ['active', 'completed', 'archived'] }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Batch updated successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } }
        }
      }
    }
  },
  '/api/v1/institution/batches/{batchId}/archive': {
    patch: {
      tags: ['Institution Management'],
      summary: 'Archive a completed batch',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Batch archived successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } }
        }
      }
    }
  },
  '/api/v1/institution/batches/{batchId}/students': {
    post: {
      tags: ['Institution Management'],
      summary: 'Add students to a batch',
      description: 'Accepts JSON student identifiers/emails or multipart CSV upload under the form-data key `csv`.',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                emails: { type: 'array', items: { type: 'string', format: 'email' } },
                studentIds: { type: 'array', items: { type: 'string' } },
                students: {
                  type: 'array',
                  items: {
                    oneOf: [
                      { type: 'string' },
                      {
                        type: 'object',
                        properties: {
                          email: { type: 'string', format: 'email' },
                          studentId: { type: 'string' },
                          userId: { type: 'string' }
                        }
                      }
                    ]
                  }
                },
                csvContent: { type: 'string', example: 'email\nstudent1@test.com\nstudent2@test.com' }
              }
            }
          },
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                csv: { type: 'string', format: 'binary', description: 'CSV file with email or student_id/studentId columns' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Students processed. Response contains added and failed rows.',
          content: { 'application/json': { schema: { type: 'object' } } }
        }
      }
    }
  },
  '/api/v1/institution/batches/{batchId}/students/{studentId}': {
    delete: {
      tags: ['Institution Management'],
      summary: 'Remove a student from a batch',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'batchId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'Student removed from batch successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Batch' } } }
        },
        404: { description: 'Student was not in this batch.' }
      }
    }
  },
  '/api/v1/institution/tutors/approved': {
    get: {
      tags: ['Institution Management'],
      summary: 'List approved tutors in the institution',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Approved tutors retrieved successfully.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } }
        }
      }
    }
  },
  '/api/v1/institution/tutor-assignments': {
    get: {
      tags: ['Institution Management'],
      summary: 'List tutor assignments',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'removed'] } },
        { name: 'assignmentType', in: 'query', schema: { type: 'string', enum: ['course', 'batch'] } },
        { name: 'tutorId', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'Tutor assignments retrieved successfully.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TutorAssignment' } } } }
        }
      }
    },
    post: {
      tags: ['Institution Management'],
      summary: 'Assign a tutor to one or more courses and/or batches',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tutorId'],
              properties: {
                tutorId: { type: 'string', example: '6a0aee5c3f8e5c2b3d9e8f1a' },
                courseIds: { type: 'array', items: { type: 'string' } },
                batchIds: { type: 'array', items: { type: 'string' } },
                batchId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Tutor assignment created and tutor notification queued.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TutorAssignment' } } } }
        }
      }
    }
  },
  '/api/v1/institution/tutor-assignments/{assignmentId}': {
    delete: {
      tags: ['Institution Management'],
      summary: 'Remove a tutor assignment while retaining history',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Tutor assignment removed successfully.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TutorAssignment' } } }
        },
        404: { description: 'Active tutor assignment not found.' }
      }
    }
  },
  '/api/v1/institution/attendance/sessions/{sessionId}/roster': {
    get: {
      tags: ['Institution Management'],
      summary: 'Get batch attendance roster for a live session',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Roster retrieved. Students include existing attendance record when available.',
          content: { 'application/json': { schema: { type: 'object' } } }
        }
      }
    }
  },
  '/api/v1/institution/attendance/sessions/{sessionId}': {
    put: {
      tags: ['Institution Management'],
      summary: 'Mark attendance for a live session',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['records'],
              properties: {
                records: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['studentId', 'status'],
                    properties: {
                      studentId: { type: 'string' },
                      status: { type: 'string', enum: ['present', 'absent', 'late'] },
                      note: { type: 'string', maxLength: 300 }
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
          description: 'Attendance saved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Attendance' } } } }
        }
      }
    }
  },
  '/api/v1/institution/attendance/sessions/{sessionId}/export.csv': {
    get: {
      tags: ['Institution Management'],
      summary: 'Export attendance CSV for a live session',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'CSV file returned.', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } }
      }
    }
  },
  '/api/v1/institution/attendance/students/{studentId}': {
    get: {
      tags: ['Institution Management'],
      summary: 'Get attendance history for a student',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Student attendance retrieved successfully.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Attendance' } } } }
        }
      }
    }
  },
  '/api/v1/institution/attendance/students/{studentId}/export.csv': {
    get: {
      tags: ['Institution Management'],
      summary: 'Export attendance CSV for a student',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'CSV file returned.', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } }
      }
    }
  },
  '/api/v1/institution/attendance/batches/{batchId}/history': {
    get: {
      tags: ['Institution Management'],
      summary: 'Get attendance history summary for a batch',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'batchId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: {
          description: 'Batch attendance history retrieved successfully.',
          content: { 'application/json': { schema: { type: 'object' } } }
        }
      }
    }
  },

  // ======================================================
  // QUIZZES & ASSESSMENTS
  // ======================================================
  '/api/v1/quizzes/lessons/{lessonId}/attempt': {
    post: {
      tags: ['Quizzes'],
      summary: 'Submit answers for quiz lesson assessment',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'lessonId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['answers'],
              properties: {
                answers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['questionId', 'selectedOptionId'],
                    properties: {
                      questionId: { type: 'string' },
                      selectedOptionId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Attempt processed.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizAttempt' } } }
        }
      }
    }
  },
  '/api/v1/quizzes/my-attempts': {
    get: {
      tags: ['Quizzes'],
      summary: 'Get quiz submission logs history',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'List attempts.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/QuizAttempt' } } } }
        }
      }
    }
  },
  '/api/v1/quizzes/attempts/{id}': {
    get: {
      tags: ['Quizzes'],
      summary: 'Retrieve quiz attempt report scorecard details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Detail attempt data.' }
      }
    }
  },

  // ======================================================
  // COURSE REVIEWS
  // ======================================================
  '/api/v1/reviews/{courseId}': {
    get: {
      tags: ['Reviews'],
      summary: 'Fetch public reviews of a course',
      parameters: [
        { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } }
      ],
      responses: {
        200: {
          description: 'List reviews.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Review' } } } }
        }
      }
    },
    post: {
      tags: ['Reviews'],
      summary: 'Leave review for a course',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rating'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                title: { type: 'string', example: 'Great structure' },
                comment: { type: 'string', example: 'Very structured and easy to digest.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Review saved.' }
      }
    },
    delete: {
      tags: ['Reviews'],
      summary: 'Delete your course review',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Review removed.' }
      }
    }
  },
  '/api/v1/reviews/{courseId}/mine': {
    get: {
      tags: ['Reviews'],
      summary: 'Get current user submitted review details for course',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'User review payload.' }
      }
    }
  },

  // ======================================================
  // ASSIGNMENT SUBMISSIONS
  // ======================================================
  '/api/v1/submissions/upload': {
    post: {
      tags: ['Submissions'],
      summary: 'Upload assignment solution asset file',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: {
                file: { type: 'string', format: 'binary', description: 'Solution document' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'File uploaded. Returns file url.' }
      }
    }
  },
  '/api/v1/submissions/lessons/{lessonId}/submit': {
    post: {
      tags: ['Submissions'],
      summary: 'Submit homework assignment solutions details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'lessonId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fileUrl: { type: 'string' },
                textAnswer: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Submission registered.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Submission' } } }
        }
      }
    }
  },
  '/api/v1/submissions/my-submissions': {
    get: {
      tags: ['Submissions'],
      summary: 'List user assignment submissions history',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'List user submission items.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Submission' } } } }
        }
      }
    }
  },
  '/api/v1/submissions/{id}': {
    get: {
      tags: ['Submissions'],
      summary: 'Get specific submission grading status details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Detail submission info.' }
      }
    }
  },
  '/api/v1/submissions/tutor/list': {
    get: {
      tags: ['Submissions'],
      summary: 'List submissions awaiting grading (Tutors)',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'query', schema: { type: 'string' } },
        { name: 'lessonId', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Submissions fetched.' }
      }
    }
  },
  '/api/v1/submissions/{id}/grade': {
    patch: {
      tags: ['Submissions'],
      summary: 'Grade submitted student assignment (Tutor)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['marksReceived'],
              properties: {
                marksReceived: { type: 'number', example: 90 },
                feedback: { type: 'string', example: 'Excellent explanations.' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Submission graded successfully.' }
      }
    }
  },

  // ======================================================
  // TUTOR GOOGLE MEET AUTHENTICATION
  // ======================================================
  '/api/tutors/google/auth': {
    get: {
      tags: ['Tutor Google OAuth'],
      summary: 'Generate and retrieve Google OAuth link for tutor account integration',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'OAuth URL authorization link returned.' }
      }
    }
  },
  '/api/tutors/google/disconnect': {
    post: {
      tags: ['Tutor Google OAuth'],
      summary: 'Revoke and disconnect Google credentials linked (Tutor)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Integration revoked and access credentials cleared.' }
      }
    }
  },
  '/api/tutors/google/callback': {
    get: {
      tags: ['Tutor Google OAuth'],
      summary: 'Google OAuth callback handler redirect URL',
      parameters: [
        { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'state', in: 'query', schema: { type: 'string' } }
      ],
      responses: {
        302: { description: 'Redirect back to dashboard with token parameters.' }
      }
    }
  },

  // ======================================================
  // WISHLIST
  // ======================================================
  '/api/v1/wishlist': {
    get: {
      tags: ['Wishlist'],
      summary: 'Get student wishlist courses list',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Wishlist items retrieved.',
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Wishlist' } } } }
        }
      }
    }
  },
  '/api/v1/wishlist/status/{courseId}': {
    get: {
      tags: ['Wishlist'],
      summary: 'Check if a specific course is on wishlist',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Returns boolean flag.' }
      }
    }
  },
  '/api/v1/wishlist/{courseId}': {
    post: {
      tags: ['Wishlist'],
      summary: 'Add course to wishlist',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course added.' }
      }
    },
    delete: {
      tags: ['Wishlist'],
      summary: 'Remove course from wishlist',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'courseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Course removed.' }
      }
    }
  },

  // ======================================================
  // CERTIFICATES
  // ======================================================
  '/api/v1/certificates/my-certificates': {
    get: {
      tags: ['Certificates'],
      summary: 'Get certificates earned by the current learner',
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: 'Certificates retrieved successfully.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: '6f4aee5c3f8e5c2b3d9e8f1e' },
                        courseId: { type: 'string', example: '6c1aee5c3f8e5c2b3d9e8f1b' },
                        certificateNumber: { type: 'string', example: 'EDU-2026-0001' },
                        issuedAt: { type: 'string', format: 'date-time' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized.' }
      }
    }
  },
  '/api/v1/certificates/validate/{certificateNumber}': {
    get: {
      tags: ['Certificates'],
      summary: 'Validate a public certificate number',
      parameters: [
        { name: 'certificateNumber', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Certificate validation result returned.' },
        404: { description: 'Certificate not found.' }
      }
    }
  },

  // ======================================================
  // LIVE RECORDING WEBHOOKS
  // ======================================================
  '/api/v1/live-recordings/webhook': {
    post: {
      tags: ['Live Recordings'],
      summary: 'Mux webhook receiver for live recording processing events',
      description: 'Public raw-body endpoint used by Mux callbacks.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true }
          }
        }
      },
      responses: {
        200: { description: 'Webhook processed successfully.' },
        400: { description: 'Invalid webhook payload or signature.' }
      }
    }
  },

  // ======================================================
  // HEALTH & SECURE UPLOAD ACCESS
  // ======================================================
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Check API process health',
      responses: {
        200: {
          description: 'API server is healthy.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
        }
      }
    }
  },
  '/health/db': {
    get: {
      tags: ['Health'],
      summary: 'Check database connection health',
      responses: {
        200: { description: 'Database connection is healthy.' },
        503: { description: 'Database is unavailable.' }
      }
    }
  },
  '/uploads/attachments/{filename}': {
    get: {
      tags: ['Uploads'],
      summary: 'Download a secure lesson attachment',
      description: 'Serves lesson attachments when the resource is public preview content or the requester is authorized and enrolled.',
      parameters: [
        { name: 'filename', in: 'path', required: true, schema: { type: 'string' } }
      ],
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Attachment file returned.' },
        400: { description: 'Invalid attachment path structure.' },
        403: { description: 'Authentication, enrollment, or lesson unlock requirement failed.' },
        404: { description: 'Attachment parent lesson or course was not found.' }
      }
    }
  }
};

const idParam = (name, description = `${name} identifier`) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description
});

const queryParam = (name, schema = { type: 'string' }, description) => ({
  name,
  in: 'query',
  required: false,
  schema,
  ...(description ? { description } : {})
});

const jsonBody = (schema) => ({
  required: true,
  content: {
    'application/json': { schema }
  }
});

const securedOperation = ({ tags, summary, description, parameters, requestBody, responses }) => ({
  tags,
  summary,
  ...(description ? { description } : {}),
  security: [{ BearerAuth: [] }],
  ...(parameters ? { parameters } : {}),
  ...(requestBody ? { requestBody } : {}),
  responses: responses || {
    200: { description: 'Request completed successfully.' },
    401: { description: 'Authentication required.' },
    403: { description: 'Insufficient permissions.' }
  }
});

const publicOperation = ({ tags, summary, description, parameters, requestBody, responses }) => ({
  tags,
  summary,
  ...(description ? { description } : {}),
  ...(parameters ? { parameters } : {}),
  ...(requestBody ? { requestBody } : {}),
  responses: responses || {
    200: { description: 'Request completed successfully.' }
  }
});

Object.assign(swaggerPaths, {
  // ======================================================
  // INSTITUTION DISCOVERY, ENROLLMENT & PAYMENTS
  // ======================================================
  '/api/v1/institutions/search': {
    get: publicOperation({
      tags: ['Institutions'],
      summary: 'Search public institutions',
      parameters: [
        queryParam('q', { type: 'string' }, 'Search term'),
        queryParam('city', { type: 'string' }),
        queryParam('page', { type: 'integer', default: 1 }),
        queryParam('limit', { type: 'integer', default: 10 })
      ]
    })
  },
  '/api/v1/institutions/{institutionId}': {
    get: publicOperation({
      tags: ['Institutions'],
      summary: 'Get public institution details',
      parameters: [idParam('institutionId')]
    })
  },
  '/api/v1/institutions/enroll': {
    post: securedOperation({
      tags: ['Institutions'],
      summary: 'Request enrollment in an institution',
      requestBody: jsonBody({
        type: 'object',
        required: ['institutionId'],
        properties: {
          institutionId: { type: 'string' },
          note: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/institutions/enroll/cancel': {
    post: securedOperation({
      tags: ['Institutions'],
      summary: 'Cancel a pending institution enrollment request',
      requestBody: jsonBody({
        type: 'object',
        required: ['requestId'],
        properties: {
          requestId: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/institutions/payment/verify': {
    post: securedOperation({
      tags: ['Institution Payments'],
      summary: 'Verify an institution payment',
      requestBody: jsonBody({
        type: 'object',
        required: ['razorpayOrderId', 'razorpayPaymentId', 'razorpaySignature'],
        properties: {
          razorpayOrderId: { type: 'string' },
          razorpayPaymentId: { type: 'string' },
          razorpaySignature: { type: 'string' },
          institutionId: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/institutions/memberships/{membershipId}': {
    patch: securedOperation({
      tags: ['Institutions'],
      summary: 'Update institution membership status',
      parameters: [idParam('membershipId')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'rejected', 'suspended', 'cancelled'] },
          adminNote: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/institutions/payment/history': {
    get: securedOperation({
      tags: ['Institution Payments'],
      summary: 'List current user institution payment history',
      parameters: [
        queryParam('page', { type: 'integer', default: 1 }),
        queryParam('limit', { type: 'integer', default: 10 })
      ]
    })
  },
  '/api/v1/institutions/payment/admin/revenue-report': {
    get: securedOperation({
      tags: ['Institution Payments'],
      summary: 'Get institution payment revenue report',
      parameters: [
        queryParam('institutionId', { type: 'string' }),
        queryParam('from', { type: 'string', format: 'date' }),
        queryParam('to', { type: 'string', format: 'date' })
      ]
    })
  },
  '/api/v1/institutions/payment/admin/{institutionId}/records': {
    get: securedOperation({
      tags: ['Institution Payments'],
      summary: 'List payment records for an institution',
      parameters: [
        idParam('institutionId'),
        queryParam('status', { type: 'string' }),
        queryParam('page', { type: 'integer', default: 1 }),
        queryParam('limit', { type: 'integer', default: 20 })
      ]
    })
  },
  '/api/v1/institutions/payment/{paymentId}/invoice': {
    get: securedOperation({
      tags: ['Institution Payments'],
      summary: 'Download an institution payment invoice',
      parameters: [idParam('paymentId')],
      responses: {
        200: { description: 'Invoice PDF returned.' },
        401: { description: 'Authentication required.' },
        404: { description: 'Payment not found.' }
      }
    })
  },
  '/api/v1/institutions/monitoring/stats': {
    get: securedOperation({
      tags: ['Institutions'],
      summary: 'Get institution monitoring statistics'
    })
  },
  '/api/v1/institutions/reconcile': {
    post: securedOperation({
      tags: ['Institution Payments'],
      summary: 'Run institution payment reconciliation'
    })
  },

  // ======================================================
  // ADMIN, LIVE SESSION & TUTOR ATTENDANCE EXPANSION
  // ======================================================
  '/api/v1/admin/users/{id}/reject-tutor': {
    patch: securedOperation({
      tags: ['Admin'],
      summary: 'Reject a tutor approval request',
      parameters: [idParam('id', 'User identifier')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          reason: { type: 'string', example: 'Profile verification failed.' }
        }
      })
    })
  },
  '/api/v1/live-sessions/tutor-batches': {
    get: securedOperation({
      tags: ['Live Sessions'],
      summary: 'List batches available to the authenticated tutor'
    })
  },
  '/api/v1/attendance/tutor/batches': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'List tutor batches for attendance management'
    })
  },
  '/api/v1/attendance/tutor/batches/{batchId}/history': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'Get tutor batch attendance history',
      parameters: [idParam('batchId')]
    })
  },
  '/api/v1/attendance/tutor/sessions/{sessionId}/roster': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'Get a tutor session attendance roster',
      parameters: [idParam('sessionId')]
    })
  },
  '/api/v1/attendance/tutor/sessions/{sessionId}': {
    put: securedOperation({
      tags: ['Attendance'],
      summary: 'Mark tutor-managed session attendance',
      parameters: [idParam('sessionId')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          records: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                studentId: { type: 'string' },
                status: { type: 'string', enum: ['present', 'absent', 'late', 'excused'] }
              }
            }
          }
        }
      })
    })
  },
  '/api/v1/attendance/tutor/sessions/{sessionId}/export.csv': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'Export tutor session attendance as CSV',
      parameters: [idParam('sessionId')],
      responses: {
        200: { description: 'CSV file returned.' },
        401: { description: 'Authentication required.' },
        403: { description: 'Insufficient permissions.' }
      }
    })
  },
  '/api/v1/attendance/tutor/students': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'List tutor students for attendance lookup',
      parameters: [queryParam('q', { type: 'string' }), queryParam('batchId', { type: 'string' })]
    })
  },
  '/api/v1/attendance/tutor/students/{studentId}': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'Get tutor-visible attendance for a student',
      parameters: [idParam('studentId')]
    })
  },
  '/api/v1/attendance/tutor/students/{studentId}/export.csv': {
    get: securedOperation({
      tags: ['Attendance'],
      summary: 'Export tutor-visible student attendance as CSV',
      parameters: [idParam('studentId')],
      responses: {
        200: { description: 'CSV file returned.' },
        401: { description: 'Authentication required.' },
        403: { description: 'Insufficient permissions.' }
      }
    })
  },

  // ======================================================
  // DISCUSSIONS & MODERATION
  // ======================================================
  '/api/v1/discussions': {
    get: securedOperation({
      tags: ['Discussions'],
      summary: 'List discussion posts for a course lesson',
      parameters: [
        queryParam('courseId', { type: 'string' }),
        queryParam('lessonId', { type: 'string' }),
        queryParam('sort', { type: 'string', enum: ['newest', 'oldest', 'top'] })
      ]
    }),
    post: securedOperation({
      tags: ['Discussions'],
      summary: 'Create a discussion post or reply',
      requestBody: jsonBody({
        type: 'object',
        required: ['courseId', 'lessonId', 'content'],
        properties: {
          courseId: { type: 'string' },
          lessonId: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          content: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/discussions/{postId}/upvote': {
    post: securedOperation({
      tags: ['Discussions'],
      summary: 'Upvote a discussion post',
      parameters: [idParam('postId')]
    }),
    delete: securedOperation({
      tags: ['Discussions'],
      summary: 'Remove a discussion upvote',
      parameters: [idParam('postId')]
    })
  },
  '/api/v1/discussions/{postId}': {
    patch: securedOperation({
      tags: ['Discussions'],
      summary: 'Edit a discussion post',
      parameters: [idParam('postId')],
      requestBody: jsonBody({
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string' } }
      })
    }),
    delete: securedOperation({
      tags: ['Discussions'],
      summary: 'Delete a discussion post',
      parameters: [idParam('postId')]
    })
  },
  '/api/v1/discussions/{postId}/pin': {
    patch: securedOperation({
      tags: ['Discussions'],
      summary: 'Pin or unpin a discussion post',
      parameters: [idParam('postId')]
    })
  },
  '/api/v1/discussions/{postId}/official': {
    patch: securedOperation({
      tags: ['Discussions'],
      summary: 'Mark or unmark a reply as official',
      parameters: [idParam('postId')]
    })
  },
  '/api/v1/discussions/{postId}/report': {
    post: securedOperation({
      tags: ['Discussions'],
      summary: 'Report a discussion post',
      parameters: [idParam('postId')],
      requestBody: jsonBody({
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string' } }
      })
    })
  },
  '/api/v1/discussions/unban-requests': {
    post: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Submit a discussion unban request',
      requestBody: jsonBody({
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string' } }
      })
    })
  },
  '/api/v1/discussions/unban-requests/my-status': {
    get: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Get current user discussion unban request status'
    })
  },
  '/api/v1/discussions/admin/reports': {
    get: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'List reported discussion posts'
    })
  },
  '/api/v1/discussions/admin/{postId}': {
    delete: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Remove a reported discussion post',
      parameters: [idParam('postId')],
      requestBody: jsonBody({
        type: 'object',
        properties: { reason: { type: 'string' } }
      })
    })
  },
  '/api/v1/discussions/admin/{postId}/dismiss-reports': {
    patch: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Dismiss reports for a discussion post',
      parameters: [idParam('postId')]
    })
  },
  '/api/v1/discussions/admin/users/{userId}/warn': {
    post: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Warn a user for discussion conduct',
      parameters: [idParam('userId')],
      requestBody: jsonBody({
        type: 'object',
        properties: { reason: { type: 'string' } }
      })
    })
  },
  '/api/v1/discussions/admin/users/{userId}/discussion-ban': {
    post: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Ban or unban a user from discussions',
      parameters: [idParam('userId')],
      requestBody: jsonBody({
        type: 'object',
        required: ['banned'],
        properties: {
          banned: { type: 'boolean' },
          reason: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/discussions/admin/unban-requests': {
    get: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'List discussion unban requests'
    })
  },
  '/api/v1/discussions/admin/unban-requests/{requestId}/resolve': {
    patch: securedOperation({
      tags: ['Discussion Moderation'],
      summary: 'Resolve a discussion unban request',
      parameters: [idParam('requestId')],
      requestBody: jsonBody({
        type: 'object',
        required: ['decision'],
        properties: {
          decision: { type: 'string', enum: ['approved', 'rejected'] },
          note: { type: 'string' }
        }
      })
    })
  },

  // ======================================================
  // INSTITUTION ADMINISTRATION EXPANSION
  // ======================================================
  '/api/v1/institution/batches/{batchId}': {
    get: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Get institution batch details',
      parameters: [idParam('batchId')]
    }),
    patch: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Update an institution batch',
      parameters: [idParam('batchId')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          courseId: { type: 'string' },
          tutorId: { type: 'string' }
        }
      })
    }),
    delete: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Delete an institution batch',
      parameters: [idParam('batchId')]
    })
  },
  '/api/v1/institution/tutor-assignments/history': {
    get: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Get tutor assignment history',
      parameters: [queryParam('tutorId', { type: 'string' }), queryParam('courseId', { type: 'string' })]
    })
  },
  '/api/v1/institution/tutor-assignments/monitoring/stats': {
    get: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Get tutor assignment monitoring statistics'
    })
  },
  '/api/v1/institution/tutor-assignments/{assignmentId}': {
    get: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Get tutor assignment details',
      parameters: [idParam('assignmentId')]
    }),
    delete: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Remove a tutor assignment',
      parameters: [idParam('assignmentId')]
    })
  },

  // ======================================================
  // OFFLINE INSTITUTION ATTENDANCE
  // ======================================================
  '/api/v1/institution-attendance/sessions': {
    post: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Create an offline attendance session',
      requestBody: jsonBody({
        type: 'object',
        required: ['batchId', 'date'],
        properties: {
          batchId: { type: 'string' },
          courseId: { type: 'string' },
          date: { type: 'string', format: 'date' },
          title: { type: 'string' }
        }
      })
    })
  },
  '/api/v1/institution-attendance/sessions/{sessionId}/roster': {
    get: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Get offline attendance session roster',
      parameters: [idParam('sessionId')]
    })
  },
  '/api/v1/institution-attendance/sessions/{sessionId}': {
    put: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Mark offline attendance',
      parameters: [idParam('sessionId')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          records: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                studentId: { type: 'string' },
                status: { type: 'string', enum: ['present', 'absent', 'late', 'excused'] }
              }
            }
          }
        }
      })
    })
  },
  '/api/v1/institution-attendance/sessions/{sessionId}/override': {
    put: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Override locked offline attendance',
      parameters: [idParam('sessionId')]
    })
  },
  '/api/v1/institution-attendance/dashboard': {
    get: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Get institution attendance dashboard'
    })
  },
  '/api/v1/institution-attendance/records': {
    get: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'List institution attendance records',
      parameters: [
        queryParam('batchId', { type: 'string' }),
        queryParam('from', { type: 'string', format: 'date' }),
        queryParam('to', { type: 'string', format: 'date' })
      ]
    })
  },
  '/api/v1/institution-attendance/records/export.csv': {
    get: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Export institution attendance records as CSV',
      responses: { 200: { description: 'CSV file returned.' }, 401: { description: 'Authentication required.' }, 403: { description: 'Insufficient permissions.' } }
    })
  },
  '/api/v1/institution-attendance/records/export.pdf': {
    get: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Export institution attendance records as PDF',
      responses: { 200: { description: 'PDF file returned.' }, 401: { description: 'Authentication required.' }, 403: { description: 'Insufficient permissions.' } }
    })
  },
  '/api/v1/institution-attendance/analytics/batches/{batchId}': {
    get: securedOperation({
      tags: ['Institution Attendance'],
      summary: 'Get attendance analytics for a batch',
      parameters: [idParam('batchId')]
    })
  },

  // ======================================================
  // INSTITUTION FEE PLANS
  // ======================================================
  '/api/v1/institution-fees/{institutionId}/public': {
    get: publicOperation({
      tags: ['Institution Fees'],
      summary: 'Get public fee plan for an institution',
      parameters: [idParam('institutionId')]
    })
  },
  '/api/v1/institution-fees/{institutionId}/history': {
    get: securedOperation({
      tags: ['Institution Fees'],
      summary: 'Get institution fee plan history',
      parameters: [idParam('institutionId')]
    })
  },
  '/api/v1/institution-fees/{institutionId}': {
    post: securedOperation({
      tags: ['Institution Fees'],
      summary: 'Create a new institution fee plan version',
      parameters: [idParam('institutionId')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          amount: { type: 'number', example: 4999 },
          currency: { type: 'string', example: 'INR' },
          billingCycle: { type: 'string', enum: ['one_time', 'monthly', 'quarterly', 'yearly'] }
        }
      })
    })
  },
  '/api/v1/institution-fees/{institutionId}/payment-requirement': {
    patch: securedOperation({
      tags: ['Institution Fees'],
      summary: 'Toggle institution payment requirement',
      parameters: [idParam('institutionId')],
      requestBody: jsonBody({
        type: 'object',
        required: ['paymentRequired'],
        properties: {
          paymentRequired: { type: 'boolean' }
        }
      })
    })
  }
});

Object.assign(swaggerPaths, {
  // ======================================================
  // CURRENT BACKEND ROUTE COVERAGE
  // ======================================================
  '/api/v1/platform/institutions/{id}': {
    patch: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Update institution details (Platform Owner)',
      parameters: [idParam('id')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          name: { type: 'string', example: 'EduCore Technical College' },
          domain: { type: 'string', example: 'educore.edu' },
          email: { type: 'string', format: 'email', example: 'admin@educore.edu' },
          description: { type: 'string' },
          code: { type: 'string', example: 'EDUCORE' }
        }
      })
    })
  },
  '/api/v1/platform/institutions/{id}/status': {
    patch: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Update institution active/suspended status (Platform Owner)',
      parameters: [idParam('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'suspended'], example: 'suspended' }
        }
      })
    })
  },
  '/api/v1/platform/institutions/{id}/admin': {
    post: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Assign institution administrator (Platform Owner)',
      parameters: [idParam('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['adminName', 'adminEmail'],
        properties: {
          adminName: { type: 'string', example: 'Institution Admin' },
          adminEmail: { type: 'string', format: 'email', example: 'admin@educore.edu' }
        }
      })
    })
  },
  '/api/v1/platform/institutions/{id}/stats': {
    get: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Get institution statistics (Platform Owner)',
      parameters: [idParam('id')]
    })
  },
  '/api/v1/platform/dashboard-stats': {
    get: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Get platform dashboard statistics'
    })
  },
  '/api/v1/admin/users/bulk-suspend': {
    patch: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Bulk suspend admin-managed users',
      requestBody: jsonBody({
        type: 'object',
        required: ['userIds'],
        properties: {
          userIds: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: { type: 'string' }
          },
          reason: { type: 'string', maxLength: 300, example: 'Policy violation' }
        }
      })
    })
  },
  '/api/v1/admin/users/{id}/profile-summary': {
    get: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Get admin user profile summary',
      parameters: [idParam('id')]
    })
  },
  '/api/v1/admin/users/{id}/suspend': {
    patch: securedOperation({
      tags: ['Platform & Admin'],
      summary: 'Suspend or unsuspend a user (Admin)',
      parameters: [idParam('id')],
      requestBody: jsonBody({
        type: 'object',
        required: ['suspended'],
        properties: {
          suspended: { type: 'boolean', example: true },
          reason: { type: 'string', maxLength: 300 }
        }
      })
    })
  },
  '/api/v1/admin/refunds/pending': {
    get: securedOperation({
      tags: ['Payments & Refunds'],
      summary: 'List pending refund requests (Admin)'
    })
  },
  '/api/v1/admin/refunds/{paymentId}/process': {
    post: securedOperation({
      tags: ['Payments & Refunds'],
      summary: 'Approve or reject a pending refund (Admin)',
      parameters: [idParam('paymentId')],
      requestBody: jsonBody({
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['approve', 'reject'], example: 'approve' },
          reason: { type: 'string', example: 'Refund approved within policy window.' }
        }
      })
    })
  },
  '/api/v1/courses/{id}/reject-review': {
    patch: securedOperation({
      tags: ['Courses'],
      summary: 'Reject a course review submission (Admin)',
      parameters: [idParam('id')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          feedback: { type: 'string', example: 'Please add at least one assessment before approval.' }
        }
      })
    })
  },
  '/api/v1/courses/{id}/flag-review': {
    patch: securedOperation({
      tags: ['Courses'],
      summary: 'Flag a course for periodic review (Admin)',
      parameters: [idParam('id')],
      requestBody: jsonBody({
        type: 'object',
        properties: {
          reason: { type: 'string', example: 'Content requires policy review.' }
        }
      })
    })
  },
  '/api/v1/enrollments/{courseId}/refund': {
    post: securedOperation({
      tags: ['Enrollments'],
      summary: 'Request a refund for an enrolled paid course',
      parameters: [idParam('courseId')]
    })
  },
  '/api/v1/certificates/templates': {
    get: securedOperation({
      tags: ['Certificates'],
      summary: 'List active certificate templates available to the current tutor/admin'
    })
  },
  '/api/v1/certificates/templates/{id}/preview': {
    get: securedOperation({
      tags: ['Certificates'],
      summary: 'Preview a certificate template',
      parameters: [idParam('id')]
    })
  },
  '/api/v1/certificates/download/{certificateNumber}': {
    get: publicOperation({
      tags: ['Certificates'],
      summary: 'Download issued certificate PDF by certificate number',
      parameters: [
        { name: 'certificateNumber', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Certificate PDF returned or redirected.' },
        404: { description: 'Certificate not found.' }
      }
    })
  },
  '/api/v1/institution/settings': {
    get: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Get institution settings'
    }),
    patch: securedOperation({
      tags: ['Institution Admin'],
      summary: 'Update institution settings',
      requestBody: jsonBody({
        type: 'object',
        required: ['allowPublicCourses'],
        properties: {
          allowPublicCourses: { type: 'boolean', example: true }
        }
      })
    })
  },
  '/api/v1/tickets': {
    post: {
      tags: ['Support Tickets'],
      summary: 'Create a new support ticket',
      description: 'Creates a support ticket. Platform admins cannot create tickets.',
      security: [{ BearerAuth: [] }],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['description'],
              properties: {
                title: { type: 'string' },
                subject: { type: 'string' },
                issueType: { type: 'string' },
                category: { type: 'string' },
                description: { type: 'string' },
                scope: { type: 'string', enum: ['institution', 'platform'], default: 'institution' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
                courseId: { type: 'string' },
                attachments: { type: 'array', items: { type: 'string', format: 'binary' } }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Ticket created successfully.' },
        400: { description: 'Bad request.' },
        403: { description: 'Forbidden.' }
      }
    },
    get: {
      tags: ['Support Tickets'],
      summary: 'Get all support tickets',
      description: 'Retrieves tickets with pagination and filters based on user role.',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'scope', in: 'query', schema: { type: 'string', enum: ['institution', 'platform'] } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed'] } },
        { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] } },
        { name: 'category', in: 'query', schema: { type: 'string' } },
        { name: 'institutionId', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
      ],
      responses: {
        200: { description: 'Tickets fetched successfully.' }
      }
    }
  },
  '/api/v1/tickets/{id}': {
    get: {
      tags: ['Support Tickets'],
      summary: 'Get ticket by ID',
      description: 'Retrieves details and message history of a specific ticket.',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Ticket fetched successfully.' },
        404: { description: 'Ticket not found.' }
      }
    }
  },
  '/api/v1/tickets/{id}/messages': {
    post: {
      tags: ['Support Tickets'],
      summary: 'Add a message to a ticket',
      description: 'Add a reply or internal note to an existing ticket.',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string' },
                isInternalNote: { type: 'boolean', default: false },
                attachments: { type: 'array', items: { type: 'string', format: 'binary' } }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Message added successfully.' }
      }
    }
  },
  '/api/v1/tickets/{id}/status': {
    patch: {
      tags: ['Support Tickets'],
      summary: 'Update ticket status',
      description: 'Update the status of a ticket. Note: Support staff cannot mark tickets as resolved or closed. Only the creator can confirm resolution.',
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
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['open', 'assigned', 'in_progress', 'waiting_for_user', 'resolved', 'closed'] }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Ticket status updated successfully.' },
        403: { description: 'Unauthorized status change.' }
      }
    }
  },
  '/api/v1/tickets/{id}/assign': {
    patch: {
      tags: ['Support Tickets'],
      summary: 'Assign a ticket to a support user',
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
              required: ['assigneeId'],
              properties: {
                assigneeId: { type: 'string', description: 'ID of the support user' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Ticket assigned successfully.' }
      }
    }
  },
  '/api/v1/tickets/{id}/escalate': {
    post: {
      tags: ['Support Tickets'],
      summary: 'Escalate a ticket',
      security: [{ BearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                notes: { type: 'string', maxLength: 500 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Ticket escalated successfully.' }
      }
    }
  },
  '/api/v1/tickets/{id}/feedback': {
    post: {
      tags: ['Support Tickets'],
      summary: 'Submit feedback for a resolved ticket',
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
              required: ['rating'],
              properties: {
                rating: { type: 'integer', minimum: 1, maximum: 5 },
                comment: { type: 'string', maxLength: 500 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Feedback submitted successfully.' }
      }
    }
  }
});

module.exports = swaggerPaths;
