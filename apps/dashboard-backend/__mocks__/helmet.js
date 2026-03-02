/**
 * Manual mock for helmet module.
 * Helmet adds security headers to Express responses.
 * This mock provides a passthrough middleware so tests work without the actual package installed.
 */

function helmet() {
  return (req, res, next) => next();
}

// Helmet also exports individual middleware functions
const middlewareNames = [
  'contentSecurityPolicy', 'crossOriginEmbedderPolicy', 'crossOriginOpenerPolicy',
  'crossOriginResourcePolicy', 'dnsPrefetchControl', 'frameguard', 'hidePoweredBy',
  'hsts', 'ieNoOpen', 'noSniff', 'originAgentCluster', 'permittedCrossDomainPolicies',
  'referrerPolicy', 'xssFilter',
];

middlewareNames.forEach(name => {
  helmet[name] = () => (req, res, next) => next();
});

module.exports = helmet;
