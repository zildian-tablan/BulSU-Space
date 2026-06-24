/**
 * Security Health Check Controller
 * 
 * Provides endpoints to test and verify security configurations
 */

/**
 * Tests for XSS vulnerabilities
 */
const xssTest = (req, res) => {
  // Get the reflected param from query string
  const reflectedParam = req.query.input || "No input provided";
  
  // Response will include reflected param - CSP should prevent XSS
  res.send(`
    <html>
      <head>
        <title>XSS Test</title>
      </head>
      <body>
        <h1>XSS Test</h1>
        <p>You sent: ${reflectedParam}</p>
        <p>If security is configured properly, any script tags or JS events in the input will not execute.</p>
        <a href="?input=<script>alert('XSS')</script>">Test XSS</a>
      </body>
    </html>
  `);
};

/**
 * Tests for clickjacking protection
 */
const clickjackTest = (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Clickjacking Test</title>
      </head>
      <body>
        <h1>Clickjacking Protection Test</h1>
        <p>This page should not be frameable if X-Frame-Options is set correctly.</p>
        <iframe src="/security-check/xss" style="width:100%;height:300px;border:1px solid #000;"></iframe>
        <p>If you see content in the iframe above, clickjacking protection is NOT working!</p>
      </body>
    </html>
  `);
};

/**
 * Tests for MIME sniffing protection
 */
const mimeSniffTest = (req, res) => {
  // Set incorrect content type to test X-Content-Type-Options
  res.setHeader('Content-Type', 'text/plain');
  
  res.send(`
    <html>
      <head>
        <title>MIME Sniffing Test</title>
      </head>
      <body>
        <h1>MIME Sniffing Protection Test</h1>
        <p>This HTML is being served with a text/plain MIME type.</p>
        <p>If X-Content-Type-Options: nosniff is working, this should display as plain text, not HTML.</p>
      </body>
    </html>
  `);
};

/**
 * Tests for HTTPS enforcement (MitM protection)
 */
const httpsTest = (req, res) => {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  res.send(`
    <html>
      <head>
        <title>HTTPS Enforcement Test</title>
      </head>
      <body>
        <h1>HTTPS Enforcement Test</h1>
        <p>Connection is ${isSecure ? 'secure (HTTPS)' : 'insecure (HTTP)'}</p>
        <p>HSTS Header: ${res.getHeader('Strict-Transport-Security') || 'Not set'}</p>
        <p>If HTTPS enforcement is working, you should always see "secure (HTTPS)" above.</p>
      </body>
    </html>
  `);
};

/**
 * Returns all security headers for inspection
 */
const headersTest = (req, res) => {
  res.json({
    message: 'Security headers set on this response',
    headers: {
      'Content-Security-Policy': res.getHeader('Content-Security-Policy'),
      'X-Frame-Options': res.getHeader('X-Frame-Options'),
      'X-Content-Type-Options': res.getHeader('X-Content-Type-Options'),
      'X-XSS-Protection': res.getHeader('X-XSS-Protection'),
      'Strict-Transport-Security': res.getHeader('Strict-Transport-Security'),
      'Referrer-Policy': res.getHeader('Referrer-Policy'),
      'Permissions-Policy': res.getHeader('Permissions-Policy'),
      'Cross-Origin-Embedder-Policy': res.getHeader('Cross-Origin-Embedder-Policy'),
      'Cross-Origin-Opener-Policy': res.getHeader('Cross-Origin-Opener-Policy'),
      'Cross-Origin-Resource-Policy': res.getHeader('Cross-Origin-Resource-Policy')
    }
  });
};

module.exports = {
  xssTest,
  clickjackTest,
  mimeSniffTest,
  httpsTest,
  headersTest
};
