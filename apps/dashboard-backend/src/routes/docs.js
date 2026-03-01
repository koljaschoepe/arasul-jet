/**
 * API Documentation routes (Swagger UI)
 * Protected by admin authentication in production
 */

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Require authentication for all docs routes in production
if (process.env.NODE_ENV === 'production') {
  router.use(requireAuth);
}

// Load OpenAPI specification
let swaggerDocument;
try {
  const swaggerPath = path.join(__dirname, '../../openapi.yaml');
  swaggerDocument = YAML.load(swaggerPath);
  logger.info('OpenAPI specification loaded successfully');
} catch (error) {
  logger.error(`Failed to load OpenAPI specification: ${error.message}`);
  swaggerDocument = {
    openapi: '3.0.3',
    info: {
      title: 'ARASUL Platform API',
      version: '1.0.0',
      description: 'API documentation not available - openapi.yaml not found',
    },
    paths: {},
  };
}

// Swagger UI options
const swaggerOptions = {
  customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #2c3e50; }
        .swagger-ui .scheme-container {
            background: #f8f9fa;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
        }
    `,
  customSiteTitle: 'ARASUL API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 3,
    docExpansion: 'list',
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
};

// Serve Swagger UI
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerDocument, swaggerOptions));

// Serve raw OpenAPI spec as JSON
router.get('/openapi.json', (req, res) => {
  res.json(swaggerDocument);
});

// Serve raw OpenAPI spec as YAML
router.get('/openapi.yaml', (req, res) => {
  const yamlPath = path.join(__dirname, '../../openapi.yaml');
  res.sendFile(yamlPath, err => {
    if (err) {
      logger.error(`Failed to serve openapi.yaml: ${err.message}`);
      res.status(404).json({
        error: 'OpenAPI specification not found',
        timestamp: new Date().toISOString(),
      });
    }
  });
});

module.exports = router;
