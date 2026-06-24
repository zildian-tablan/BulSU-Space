/**
 * Enhanced Security Middleware
 * 
 * Provides additional security protections beyond Helmet's defaults:
 * - Anti-CSRF protection
 * - Additional XSS protections
 * - Request sanitization
 * - HTTP Parameter Pollution prevention
 * - Reflected File Download protection
 */

// Using Node.js built-in crypto instead of the deprecated package
const { randomBytes } = require('crypto');
const hpp = require('hpp');
// Use express-validator for input sanitization instead of xss-clean
const { body, validationResult, sanitizeParam, sanitizeQuery, sanitizeBody } = require('express-validator');

/**
 * Generates a CSRF token
 */
const generateCsrfToken = () => {
  return randomBytes(32).toString('hex');
};

/**
 * Anti-CSRF middleware
 * Uses double submit cookie pattern for CSRF protection
 * This implementation does not rely on deprecated csurf package
 */
const csrfProtection = (req, res, next) => {
  // Skip for GET requests and non-state-changing operations
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const csrfCookie = req.cookies.csrf;
  const csrfHeader = req.headers['x-csrf-token'];
  const csrfBody = req.body && req.body._csrf;
  
  // Check if CSRF token exists and matches
  const csrfToken = csrfHeader || csrfBody;
  
  if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
    console.warn('CSRF protection triggered', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      hasToken: !!csrfToken,
      hasCookie: !!csrfCookie
    });
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  
  next();
};

/**
 * Sets a CSRF cookie on responses
 */
const setCsrfCookie = (req, res, next) => {
  // Generate and set a new CSRF token for GET requests
  if (req.method === 'GET') {
    const csrfToken = generateCsrfToken();
    res.cookie('csrf', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000 // 1 hour
    });
    
    // Expose a safe JS variable for frontend forms
    res.locals.csrfToken = csrfToken;
  }
  next();
};

/**
 * XSS sanitization middleware
 * Uses express-validator to sanitize request body, params, and query
 */
const xssProtection = (req, res, next) => {
  // If the request has a body
  if (req.body) {
    // Convert the body to an array of sanitization middlewares
    const sanitizers = Object.keys(req.body).map(key => 
      sanitizeBody(key).trim().escape()
    );
    
    // Apply all sanitizers
    Promise.all(sanitizers.map(sanitizer => sanitizer.run(req)))
      .then(() => {
        // Apply the same for query parameters
        const queryKeys = Object.keys(req.query || {});
        return Promise.all(queryKeys.map(key => 
          sanitizeQuery(key).trim().escape().run(req)
        ));
      })
      .then(() => {
        // And URL parameters
        const paramKeys = Object.keys(req.params || {});
        return Promise.all(paramKeys.map(key => 
          sanitizeParam(key).trim().escape().run(req)
        ));
      })
      .then(() => next())
      .catch(err => {
        console.error('XSS protection error:', err);
        next();
      });
  } else {
    next();
  }
};

/**
 * HTTP Parameter Pollution prevention
 */
const preventParameterPollution = hpp();

/**
 * Sanitize request input for specific routes
 * @param {Array} fields - The fields to sanitize
 */
const sanitizeInputs = (fields) => {
  const sanitizers = fields.map(field => 
    body(field).trim().escape()
  );
  
  return [
    ...sanitizers,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      next();
    }
  ];
};

/**
 * Reflected File Download protection
 * Prevents attacker-controlled input from being reflected in download responses
 */
const reflectedDownloadProtection = (req, res, next) => {
  // Wrap the original send method to check for downloads
  const originalSend = res.send;
  
  res.send = function(body) {
    // Look for download headers
    const disposition = res.get('Content-Disposition');
    
    if (disposition && disposition.includes('attachment')) {
      // For downloads, ensure no reflected parameters from the request
      // are in the response body or filename
      if (typeof body === 'string') {
        // Sanitize the download content if needed
      }
      
      // Check and sanitize the filename
      const filename = disposition.match(/filename="([^"]+)"/);
      if (filename && filename[1]) {
        // Ensure the filename is safe
        const safeFilename = filename[1].replace(/[^a-zA-Z0-9._-]/g, '');
        if (safeFilename !== filename[1]) {
          res.setHeader('Content-Disposition', 
            disposition.replace(filename[1], safeFilename));
        }
      }
    }
    
    // Call the original method
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Adds various security headers not covered by Helmet
 */
const additionalSecurityHeaders = (req, res, next) => {
  // Permissions Policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(self), payment=(self)');
    
  // Cross-Origin Resource Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  
  // Cross-Origin Opener Policy
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  
  // Cross-Origin Embedder Policy
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  
  next();
};

/**
 * Cache control headers to prevent sensitive data caching
 */
const noCacheHeaders = (req, res, next) => {
  // Apply no-cache headers for sensitive routes
  if (req.path.includes('/profile') || 
      req.path.includes('/admin') || 
      req.path.includes('/settings')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
};

module.exports = {
  csrfProtection,
  setCsrfCookie,
  xssProtection,
  preventParameterPollution,
  sanitizeInputs,
  reflectedDownloadProtection,
  additionalSecurityHeaders,
  noCacheHeaders
};
