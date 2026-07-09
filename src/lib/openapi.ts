/**
 * OpenAPI 3.1 specification for the PDAM public API.
 *
 * Served as JSON at `/api/openapi.json` and rendered with Swagger UI at `/api-docs`.
 * Authenticate requests with an API key generated from the Account Dashboard,
 * passed either as the `x-api-key` header or `Authorization: Bearer <key>`.
 */
export function buildOpenApiSpec(serverUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'PDAM API',
      version: '1.0.0',
      description:
        'Public API for the Personal Digital Asset Manager (PDAM).\n\n' +
        'All endpoints require authentication with an API key. Generate one from your ' +
        'Account Dashboard, then send it as the `x-api-key` header or as a ' +
        '`Authorization: Bearer <key>` header. Session cookies are also accepted when ' +
        'calling the API from the web app.',
    },
    servers: [{ url: serverUrl, description: 'Current server' }],
    tags: [
      { name: 'User', description: 'Profile information for the authenticated user.' },
      {
        name: 'Marketplaces',
        description: 'Marketplace sources the user can view and manage.',
      },
      {
        name: 'Library',
        description: 'The user\'s digital asset library: assets, versions, and files.',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API key generated from the Account Dashboard.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key passed as `Authorization: Bearer <key>`.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
          required: ['error'],
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            emailVerified: { type: 'boolean' },
            image: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        UserUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            image: {
              type: 'string',
              format: 'uri',
              nullable: true,
              description: 'http(s) URL to an avatar image, or null to clear.',
            },
          },
        },
        MarketplaceSource: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            baseUrl: { type: 'string', nullable: true },
            isUserDefined: { type: 'boolean' },
            ownerUserId: { type: 'string', nullable: true },
            canEdit: {
              type: 'boolean',
              description: 'True when the current user owns and may delete this source.',
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        MarketplaceSourceCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', maxLength: 100 },
            slug: {
              type: 'string',
              maxLength: 100,
              description: 'Lowercase letters, numbers, and hyphens. Derived from name if omitted.',
            },
            baseUrl: { type: 'string', format: 'uri', nullable: true },
          },
        },
        AssetSummary: {
          type: 'object',
          description: 'Asset as returned in list responses (license key omitted).',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            slug: { type: 'string' },
            descriptionText: { type: 'string', nullable: true },
            tags: { type: 'array', items: { type: 'string' } },
            creatorIds: { type: 'array', items: { type: 'string', format: 'uuid' }, nullable: true },
            marketplaceSourceId: { type: 'string', format: 'uuid', nullable: true },
            productUrl: { type: 'string', nullable: true },
            thumbnailFileThumbnailId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AssetDetail: {
          allOf: [
            { $ref: '#/components/schemas/AssetSummary' },
            {
              type: 'object',
              properties: {
                licenseKey: { type: 'string', nullable: true },
                marketplaceSource: {
                  allOf: [{ $ref: '#/components/schemas/MarketplaceSource' }],
                  nullable: true,
                },
                creators: { type: 'array', items: { type: 'object' } },
                thumbnail: { type: 'object', nullable: true },
                versions: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AssetVersion' },
                },
              },
            },
          ],
        },
        AssetCreate: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            description: {
              type: 'string',
              description:
                'Markdown description. Upload images via POST /api/assets/{id}/description-images, then embed with ![alt](/api/assets/{id}/description-images/{imageId}).',
            },
            tags: { type: 'string', description: 'Comma-separated list of tags.' },
            licenseKey: { type: 'string' },
            marketplaceSourceId: { type: 'string', format: 'uuid' },
            productUrl: { type: 'string', format: 'uri' },
            creators: {
              type: 'array',
              description: 'Array of creator entries. Each has an optional id (for existing) and a name.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', nullable: true },
                  name: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
        },
        AssetUpdate: {
          type: 'object',
          description: 'All fields optional; only provided fields are updated.',
          properties: {
            title: { type: 'string' },
            description: {
              type: 'string',
              description:
                'Markdown description. Upload images via POST /api/assets/{id}/description-images, then embed with ![alt](/api/assets/{id}/description-images/{imageId}). Unreferenced images are removed when the description is saved.',
            },
            tags: { type: 'string', description: 'Comma-separated list of tags.' },
            licenseKey: { type: 'string' },
            marketplaceSourceId: { type: 'string', format: 'uuid' },
            productUrl: { type: 'string', format: 'uri' },
            creators: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', nullable: true },
                  name: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
        },
        AssetVersion: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            productId: { type: 'string', format: 'uuid' },
            version: { type: 'string' },
            releaseNotes: { type: 'string', nullable: true },
            publishedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AssetVersionCreate: {
          type: 'object',
          required: ['version'],
          properties: {
            version: { type: 'string', description: 'Version label, e.g. "1.0.0".' },
            releaseNotes: { type: 'string' },
          },
        },
        DescriptionImage: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            url: { type: 'string' },
            width: { type: 'integer' },
            height: { type: 'integer' },
          },
        },
        FileUploadResult: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            file: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                sha256: { type: 'string' },
                fileName: { type: 'string' },
                mimeType: { type: 'string' },
                fileSize: { type: 'integer' },
                userAssetFileId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid credentials.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        NotFound: {
          description: 'Resource not found.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        BadRequest: {
          description: 'Invalid request.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    paths: {
      '/api/user': {
        get: {
          tags: ['User'],
          summary: 'Get profile',
          description: 'Returns the profile of the authenticated user.',
          responses: {
            '200': {
              description: 'The user profile.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/User' } },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
        put: {
          tags: ['User'],
          summary: 'Update profile',
          description: 'Updates the display name and/or avatar image of the authenticated user.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserUpdate' } },
            },
          },
          responses: {
            '200': {
              description: 'The updated user profile.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/User' } },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/marketplace-sources': {
        get: {
          tags: ['Marketplaces'],
          summary: 'List marketplaces',
          description:
            'Lists platform marketplaces plus any user-defined marketplaces owned by the user.',
          responses: {
            '200': {
              description: 'Array of marketplace sources.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/MarketplaceSource' },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Marketplaces'],
          summary: 'Add marketplace',
          description: 'Creates a new user-defined marketplace source the user can edit.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MarketplaceSourceCreate' },
              },
            },
          },
          responses: {
            '201': {
              description: 'The created marketplace source.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MarketplaceSource' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/marketplace-sources/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        delete: {
          tags: ['Marketplaces'],
          summary: 'Remove marketplace',
          description: 'Deletes a user-defined marketplace source owned by the user.',
          responses: {
            '200': {
              description: 'Deleted.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { success: { type: 'boolean' } },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': {
              description: 'Cannot delete a platform marketplace or one owned by another user.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/assets': {
        get: {
          tags: ['Library'],
          summary: 'List assets',
          description: 'Returns a summary of all assets owned by the user (newest first).',
          responses: {
            '200': {
              description: 'Array of asset summaries.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/AssetSummary' },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Library'],
          summary: 'Add asset',
          description: 'Creates a new asset in the user\'s library.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AssetCreate' } },
            },
          },
          responses: {
            '201': {
              description: 'The created asset.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/AssetSummary' } },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/assets/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        get: {
          tags: ['Library'],
          summary: 'Get asset details',
          description: 'Returns full details of an asset, including versions and files.',
          responses: {
            '200': {
              description: 'The asset detail.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/AssetDetail' } },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
        put: {
          tags: ['Library'],
          summary: 'Update asset item',
          description: 'Updates fields of an existing asset. Only provided fields change.',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AssetUpdate' } },
            },
          },
          responses: {
            '200': {
              description: 'The updated asset.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/AssetSummary' } },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
        delete: {
          tags: ['Library'],
          summary: 'Delete asset',
          description: 'Deletes an asset and its associated versions and files.',
          responses: {
            '200': {
              description: 'Deleted.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { success: { type: 'boolean' } },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/assets/{id}/versions': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        post: {
          tags: ['Library'],
          summary: 'Add asset version',
          description: 'Creates a new version of an asset.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssetVersionCreate' },
              },
            },
          },
          responses: {
            '201': {
              description: 'The created version.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/AssetVersion' } },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/assets/{id}/versions/{versionId}/files': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'versionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        put: {
          tags: ['Library'],
          summary: 'Upload file to asset version',
          description:
            'Uploads a file (multipart/form-data, field name `file`, max 512MB) to an asset version.',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The stored file.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FileUploadResult' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
        post: {
          tags: ['Library'],
          summary: 'Upload file to asset version (alias of PUT)',
          description: 'Identical to PUT. Uploads a file to an asset version.',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The stored file.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FileUploadResult' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
        delete: {
          tags: ['Library'],
          summary: 'Remove file from asset version',
          parameters: [
            {
              name: 'blobId',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uuid' },
              description: 'ID of the blob/file to remove from the version.',
            },
          ],
          responses: {
            '200': {
              description: 'Removed.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { success: { type: 'boolean' } },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/assets/{id}/description-images': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        post: {
          tags: ['Library'],
          summary: 'Upload description image',
          description:
            'Uploads an image for use in the asset description markdown (multipart/form-data, field name `image`, image/*, max 10MB). Returns a URL to embed as ![alt](url).',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['image'],
                  properties: {
                    image: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'The uploaded description image.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DescriptionImage' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/assets/{id}/description-images/{imageId}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'imageId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        get: {
          tags: ['Library'],
          summary: 'Get description image',
          description: 'Returns the image bytes for a description image embedded in asset markdown.',
          responses: {
            '200': {
              description: 'Image bytes.',
              content: {
                'image/webp': { schema: { type: 'string', format: 'binary' } },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/assets/{id}/thumbnail': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        post: {
          tags: ['Library'],
          summary: 'Upload asset thumbnail',
          description:
            'Uploads a thumbnail image (multipart/form-data, field name `thumbnail`, image/*, max 10MB).',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['thumbnail'],
                  properties: {
                    thumbnail: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'The generated thumbnail and stored blob.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      thumbnail: { type: 'object' },
                      blob: { type: 'object' },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
    },
  } as const;
}
