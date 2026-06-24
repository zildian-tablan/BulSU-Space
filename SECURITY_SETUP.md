# Security Setup Guide

## Critical Security Notice
**NEVER commit real API keys, service account keys, or credentials to the repository!**

## Environment Setup

### 1. Firebase Service Account Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`bulsuspace`)
3. Go to Project Settings > Service Accounts
4. Click "Generate new private key"
5. Download the JSON file
6. Extract the following values and add them to your `.env` file:

```env
FIREBASE_PROJECT_ID=your-actual-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com  
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_PRIVATE_KEY\n-----END PRIVATE KEY-----"
FIREBASE_PRIVATE_KEY_ID=your-actual-private-key-id
```

### 2. SendGrid API Key

1. Go to [SendGrid Dashboard](https://app.sendgrid.com/)
2. Navigate to Settings > API Keys
3. Create a new API key with appropriate permissions
4. Add to your `.env` file:

```env
SENDGRID_API_KEY=SG.your-actual-sendgrid-api-key
```

### 3. HuggingFace API Key

1. Go to [HuggingFace](https://huggingface.co/)
2. Sign in and go to Settings > Access Tokens
3. Create a new token
4. Add to your `.env` file:

```env
HUGGINGFACE_API_KEY=hf_your-actual-huggingface-token
```

## Security Best Practices

### File Security
- **NEVER** commit files named `serviceAccountKey.json` or similar
- Keep all `.env` files local and never commit them
- Use the provided templates with placeholder values

### API Key Security
- Generate new API keys if previous ones were exposed
- Use environment-specific API keys (dev/staging/prod)
- Regularly rotate API keys
- Use minimal required permissions for each service

### Development Workflow
1. Copy `.env.example` to `.env` (if available)
2. Fill in your actual credentials in `.env`
3. Verify `.env` is in `.gitignore`
4. Test locally before deploying

## Exposed Credentials - Action Required

**The following credentials were found exposed and MUST be regenerated:**

1. **Firebase Service Account** - The entire service account key was exposed
   - **Action**: Generate new service account key in Firebase Console
   - **Impact**: Previous key compromised - full Firebase access

2. **SendGrid API Key**: `your-sendgrid-api-key`
   - **Action**: Revoke any exposed key and generate a new one if needed
   - **Impact**: Email sending functionality compromised if leaked

3. **HuggingFace API Key**: `your-huggingface-api-key`
   - **Action**: Revoke any exposed token and generate a new one if needed
   - **Impact**: AI model access compromised if leaked

## Security Tools

This project includes security tools to help you keep your credentials safe:

### Key Rotation Script
A command-line tool to help rotate exposed credentials:

```bash
npm run security:keys
```

This tool will:
- Guide you through the process of generating new API keys
- Help you configure environment variables securely
- Support for Firebase, SendGrid, and HuggingFace credentials

### Security Scan Script 
Check your codebase for exposed secrets:

```bash
npm run security:check
```

This will scan for:
- Hardcoded API keys and secrets
- Exposed credentials in code
- Missing security configuration

## Additional Security Measures

### Server Security
- The server now includes proper environment variable validation
- Firebase initialization fails gracefully without credentials
- Rate limiting and security headers are implemented

### Firestore Security Rules
Review and strengthen `firestore.rules` for proper data access control.

### File Upload Security
Implement proper file validation and scanning for uploads.

## Web Application Security Protections

The application uses advanced security middleware to protect against common web vulnerabilities:

### XSS (Cross-Site Scripting) Protection
- Content Security Policy (CSP) implemented via Helmet
- Input sanitization and validation
- XSS-clean middleware for request body sanitization
- Restrictive script source directives

### Clickjacking Protection
- X-Frame-Options header set to DENY
- Frame-ancestors CSP directive restriction
- Additional framing controls

### MIME-Sniffing Protection
- X-Content-Type-Options: nosniff
- Proper content type headers for all responses

### Man-in-the-Middle Attack Protection
- HTTP Strict Transport Security (HSTS)
- Automatic HTTP to HTTPS upgrading
- Secure cookie attributes
- TLS configuration

### Additional Protections
- CSRF protection using double submit pattern
- HTTP Parameter Pollution protection
- Reflected File Download protection
- Permissions Policy restrictions
- Cache control for sensitive data

For more details, see the [middleware documentation](./server/middleware/README.md).

## Emergency Response
If credentials are accidentally committed:
1. Immediately revoke/regenerate all affected keys (use `npm run security:keys`)
2. Force push to remove from git history (if possible)
3. Check access logs for unauthorized usage
4. Update all environments with new credentials

---
**Remember**: Security is everyone's responsibility. When in doubt, ask!
