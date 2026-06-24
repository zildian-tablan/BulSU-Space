/**
 * HTTPS and Transport Security Middleware
 * 
 * Provides protections against Man-in-the-Middle (MitM) attacks by
 * enforcing HTTPS and implementing secure transport policies.
 */

/**
 * Middleware to redirect HTTP requests to HTTPS
 * Only used in production environment
 */
const httpsRedirect = (req, res, next) => {
  // Check if the request is secure or if it's coming from a proxy that's secure
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  // Skip for non-production environments
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Redirect insecure requests to HTTPS
  if (!isSecure) {
    const httpsUrl = `https://${req.hostname}${req.url}`;
    return res.redirect(301, httpsUrl);
  }
  
  next();
};

/**
 * Add HSTS and related headers for MitM protection
 */
const transportSecurity = (req, res, next) => {
  // Only set these headers in production
  if (process.env.NODE_ENV === 'production') {
    // HTTP Strict Transport Security
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
    
    // Public Key Pinning Extension for HTTP (HPKP)
    // This is deprecated but included for older browsers
    // In modern setups, use Certificate Transparency instead
    // Be careful with this as incorrect configuration can lock users out
    /*
    res.setHeader(
      'Public-Key-Pins',
      'pin-sha256="base64+primary=="; pin-sha256="base64+backup=="; max-age=5184000; includeSubDomains'
    );
    */
    
    // Expect-CT header for Certificate Transparency
    res.setHeader(
      'Expect-CT',
      'max-age=86400, enforce, report-uri="https://example.com/report-cert-transparency"'
    );
  }
  
  next();
};

/**
 * Middleware to add secure cookie flags
 * Set cookies with Secure and HttpOnly flags
 */
const secureCookies = (req, res, next) => {
  // Override the cookie setting method
  const originalSetCookie = res.cookie;
  
  // Replace it with a more secure version
  res.cookie = function (name, value, options = {}) {
    // Add security flags in production
    if (process.env.NODE_ENV === 'production') {
      options.secure = true; // Only send cookies over HTTPS
    }
    
    // Always set HttpOnly to prevent JavaScript access
    options.httpOnly = true;
    
    // Add SameSite attribute to prevent CSRF
    if (!options.sameSite) {
      options.sameSite = 'strict';
    }
    
    // Call the original method with the enhanced options
    return originalSetCookie.call(this, name, value, options);
  };
  
  next();
};

module.exports = {
  httpsRedirect,
  transportSecurity,
  secureCookies
};
