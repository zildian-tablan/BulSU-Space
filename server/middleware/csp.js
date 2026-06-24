/**
 * Content Security Policy (CSP) Configuration
 * 
 * This module provides functions to generate and configure CSP policies
 * to protect against various types of attacks, especially XSS.
 */

/**
 * Generate a nonce for use in CSP policies
 * @returns {string} A cryptographically secure random string
 */
const generateNonce = () => {
  const { randomBytes } = require('crypto');
  return randomBytes(16).toString('base64');
};

/**
 * Creates a CSP policy middleware that generates a unique nonce per request
 * and sets the appropriate headers
 * 
 * @param {Object} options - CSP configuration options
 * @returns {Function} Express middleware
 */
const createCSPPolicy = (options = {}) => {
  return (req, res, next) => {
    // Generate a unique nonce for this request
    const nonce = generateNonce();
    
    // Store the nonce so it can be used in templates
    res.locals.cspNonce = nonce;
    
    // Default sources that are more restrictive than Helmet
    const defaultSrc = options.defaultSrc || ["'self'"];
    const scriptSrc = options.scriptSrc || ["'self'", `'nonce-${nonce}'`];
    const styleSrc = options.styleSrc || ["'self'", "'unsafe-inline'"]; // Consider using nonces instead
    const imgSrc = options.imgSrc || ["'self'", "data:", "https:"];
    const connectSrc = options.connectSrc || ["'self'"];
    const fontSrc = options.fontSrc || ["'self'"];
    const objectSrc = options.objectSrc || ["'none'"];
    const mediaSrc = options.mediaSrc || ["'self'"];
    const frameSrc = options.frameSrc || ["'self'"];
    
    // Build the CSP directive string
    const policy = [
      `default-src ${defaultSrc.join(' ')};`,
      `script-src ${scriptSrc.join(' ')};`,
      `style-src ${styleSrc.join(' ')};`,
      `img-src ${imgSrc.join(' ')};`,
      `connect-src ${connectSrc.join(' ')};`,
      `font-src ${fontSrc.join(' ')};`,
      `object-src ${objectSrc.join(' ')};`,
      `media-src ${mediaSrc.join(' ')};`,
      `frame-src ${frameSrc.join(' ')};`,
      "base-uri 'self';",
      "form-action 'self';",
      "frame-ancestors 'self';",
      "block-all-mixed-content;",
      "upgrade-insecure-requests;"
    ].join(' ');
    
    // Set the CSP header
    res.setHeader('Content-Security-Policy', policy);
    
    // Continue to the next middleware
    next();
  };
};

/**
 * CSP configuration for a React application
 * Includes common settings for React apps
 */
const reactCSP = createCSPPolicy({
  scriptSrc: ["'self'", "https://apis.google.com"],
  connectSrc: [
    "'self'", 
    "https://firebaseapp.com", 
    "https://*.firebaseapp.com",
    "https://*.firebaseio.com",
    "https://*.googleapis.com"
  ],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:", "blob:"],
});

module.exports = {
  generateNonce,
  createCSPPolicy,
  reactCSP
};
