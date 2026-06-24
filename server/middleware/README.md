# Enhanced Security Middleware

This module provides advanced security protections for the BulSU Space application, working alongside Helmet.js to provide comprehensive security against common web vulnerabilities.

## Security Protections

### 1. XSS (Cross-Site Scripting) Protection

- **Helmet's Content Security Policy (CSP)**: Restrictive CSP that blocks unauthorized script execution
- **XSS-Clean**: Sanitizes request inputs to remove potentially malicious code
- **Input Sanitization**: Additional input validation and sanitization for specific routes

### 2. Clickjacking Protection

- **Helmet's X-Frame-Options**: Set to 'DENY' to prevent framing of the application
- **Strict CSP frame-ancestors**: Additional control over framing permissions

### 3. MIME-Sniffing Protection

- **Helmet's X-Content-Type-Options**: Set to 'nosniff' to prevent MIME type sniffing
- **Proper Content Type Headers**: Always sets correct content types for all responses

### 4. Man-in-the-Middle (MitM) Attack Protection

- **Helmet's Strict-Transport-Security (HSTS)**: Forces HTTPS connections
- **Upgrade-Insecure-Requests**: Automatically upgrades HTTP to HTTPS
- **Secure Cookie Flags**: Ensures cookies are only transmitted over secure connections

### 5. CSRF (Cross-Site Request Forgery) Protection

- **Double Submit Cookie Pattern**: Validates CSRF tokens for state-changing operations
- **SameSite Cookie Attributes**: Restricts cookies to same-site requests

### 6. Additional Protections

- **HTTP Parameter Pollution (HPP) Protection**: Prevents parameter pollution attacks
- **Reflected File Download (RFD) Protection**: Prevents reflected file download vulnerabilities
- **Permissions Policy**: Restricts access to browser features (camera, microphone, etc.)
- **Cache Control**: Prevents caching of sensitive data

## Usage

The middleware is automatically applied in `server.js`. Individual components can be applied to specific routes as needed:

```javascript
const { sanitizeInputs } = require('./middleware/security');

// Apply sanitization to specific input fields
app.post('/api/posts', 
  sanitizeInputs(['title', 'content']),
  postsController.createPost
);
```

## Security Best Practices

1. **Never disable security headers** without understanding the implications
2. **Keep dependencies updated** to protect against known vulnerabilities
3. **Apply least privilege principle** for all APIs and routes
4. **Log security events** to detect potential attacks
5. **Regularly audit security settings** to ensure they remain effective

## Extending the Security Middleware

When adding new security features:

1. Add the feature to the appropriate middleware file
2. Document the feature and its purpose
3. Include proper logging for security events
4. Consider performance implications
5. Test thoroughly to ensure compatibility

## Further Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [HTTP Strict Transport Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
