const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Load security middleware modules
let securityMiddleware;
let transportSecurity;
let csp;

// Import security middleware with error handling
try {
  securityMiddleware = require('./middleware/security');
  transportSecurity = require('./middleware/transport-security');
  csp = require('./middleware/csp');
} catch (error) {
  console.warn('Security middleware not fully loaded:', error.message);
  // Provide empty implementations as fallbacks
  securityMiddleware = {
    xssProtection: (req, res, next) => next(),
    preventParameterPollution: (req, res, next) => next(),
    additionalSecurityHeaders: (req, res, next) => next(),
    noCacheHeaders: (req, res, next) => next(),
    reflectedDownloadProtection: (req, res, next) => next()
  };
  transportSecurity = {
    httpsRedirect: (req, res, next) => next(),
    transportSecurity: (req, res, next) => next(),
    secureCookies: (req, res, next) => next()
  };
  csp = {
    reactCSP: (req, res, next) => next()
  };
}

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Firebase Admin
let serviceAccount;
let firebaseInitialized = false;
try {
  // Check if the service account file exists
  if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
    serviceAccount = require('./serviceAccountKey.json');
    // Check if it's a real service account (not placeholder)
    if (serviceAccount.private_key && serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----') && 
        serviceAccount.private_key.length > 200 && !serviceAccount.private_key.includes('placeholder')) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized with service account');
      firebaseInitialized = true;
    } else {
      console.log('Service account contains placeholder data, skipping Firebase initialization');
    }
  } else {
    // Use environment variables as fallback
    console.log('Service account file not found, trying environment variables');
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (privateKey && privateKey.length > 200 && !privateKey.includes('placeholder')) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        })
      });
      console.log('Firebase Admin initialized with environment variables');
      firebaseInitialized = true;
    } else {
      console.log('Firebase credentials not available or invalid, running without Firebase');
    }
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  console.log('Continuing without Firebase initialization...');
}

// Initialize Firestore (only if Firebase is initialized)
let db = null;
if (firebaseInitialized) {
  db = admin.firestore();
} else {
  console.log('Firestore not available - Firebase not initialized');
}

// Security middleware - Enhanced protection against XSS, Clickjacking, MIME-sniffing, and MitM attacks
// We're using a separate CSP middleware for dynamic nonce generation, so disable Helmet's CSP
app.use(helmet({
  // Disable CSP in Helmet since we're using our custom CSP middleware
  contentSecurityPolicy: false,
  
  // Clickjacking Protection
  frameguard: { 
    action: 'deny'  // Never allow framing (strongest protection against clickjacking)
  },
  
  // MIME-Sniffing Protection

  noSniff: true,
  
  // XSS Protection (legacy browsers)
  xssFilter: true,
  
  // Man-in-the-Middle Protection
  // The HSTS settings are now handled separately in transport-security middleware
  // for better control, but we'll include them here as well as defense in depth
  hsts: {
    maxAge: 31536000,        // 1 year in seconds
    includeSubDomains: true, // Apply to all subdomains
    preload: true            // Ready for HSTS preload list
  },
  
  // Additional Security Protections
  
  // Disable X-Powered-By header to reduce fingerprinting
  hidePoweredBy: true,
  
  // Prevent browsers from performing DNS prefetching
  dnsPrefetchControl: { allow: false },
  
  // Referrer Policy control - limit information sent in Referer header
  referrerPolicy: { 
    policy: 'strict-origin-when-cross-origin' // Balanced privacy and functionality
  },
  
  // Cross-Origin protections
  crossOriginEmbedderPolicy: true, // Require corp on resources
  crossOriginOpenerPolicy: { policy: 'same-origin' }, 
  crossOriginResourcePolicy: { policy: 'same-origin' },
  
  // Origin isolation
  originAgentCluster: true,
  
  // Permissions Policy (formerly Feature Policy) - control browser features
  // We'll set these through additionalSecurityHeaders instead for more control
  permissionsPolicy: false
}));

// Add HTTPS and transport security middleware (MitM protection)
// Apply early in middleware chain to redirect HTTP requests before processing
try {
  // To avoid naming conflict, use different variable names for the destructured functions
  const { 
    httpsRedirect: redirectHttps, 
    transportSecurity: applyTransportSecurity, 
    secureCookies: applyCookieSecurity 
  } = transportSecurity;
  
  app.use(redirectHttps); // Redirect HTTP to HTTPS in production
  app.use(applyTransportSecurity); // Apply transport security headers
  app.use(applyCookieSecurity); // Set secure cookie defaults
  
  console.log('✅ Transport security middleware applied');
} catch (error) {
  console.error('⚠️ Failed to apply transport security middleware:', error.message);
}

// Add cookie parser middleware - required for CSRF tokens
app.use(cookieParser()); 

// Apply content security policy (XSS protection)
try {
  app.use(csp.reactCSP); // Apply CSP tailored for React apps
  console.log('✅ Content Security Policy applied');
} catch (error) {
  console.error('⚠️ Failed to apply Content Security Policy:', error.message);
}

// Apply additional security middleware
try {
  const { 
    xssProtection, 
    preventParameterPollution,
    additionalSecurityHeaders,
    noCacheHeaders,
    reflectedDownloadProtection
  } = securityMiddleware;
  
  app.use(xssProtection); // Add XSS protection
  app.use(preventParameterPollution); // Prevent HTTP Parameter Pollution
  app.use(additionalSecurityHeaders); // Add additional security headers
  app.use(noCacheHeaders); // Prevent caching of sensitive data
  app.use(reflectedDownloadProtection); // Prevent Reflected File Download attacks
  
  console.log('✅ Enhanced security middleware successfully applied');
} catch (error) {
  console.error('⚠️ Failed to apply some security middleware:', error.message);
}

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts. Please try again in 1 minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`Rate limit exceeded for IP: ${req.ip}, endpoint: ${req.path}`);
    res.status(429).json({
      error: 'Too many authentication attempts. Please try again in 1 minute.',
      retryAfter: 60 // seconds
    });
  }
});

// Slow down repeated requests
const speedLimiter = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 2, // Allow 2 requests per windowMs without delay
  delayMs: () => 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Max delay of 20 seconds
  skipSuccessfulRequests: true,
  validate: { delayMs: false } // Disable warning
});

// General API rate limiting
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Enhanced CORS Configuration to protect against Cross-Site attacks
const allowedOrigins = process.env.CORS_ORIGINS ? 
  process.env.CORS_ORIGINS.split(',') : 
  [
    'http://localhost:3000',           // Local development
    'http://localhost:3001',           // Alternative local port
    'https://bulsuspace.web.app',      // Firebase Hosting production domain
    'https://bulsuspace.firebaseapp.com' // Firebase alternate domain
  ];

// Replace regex patterns with explicit origins for better security
// Instead of allowing any Firebase subdomain, explicitly list the ones you need
const corsOptions = {
  // Dynamic origin validation for stronger security
  origin: function (origin, callback) {
    // Skip origin check for development/testing environments
    // or for requests without an origin (like mobile apps)
    if (!origin || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Check if the origin is in the allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies to be sent with requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Restrict HTTP methods
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token', // For CSRF protection
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length'],
  optionsSuccessStatus: 200, // For legacy browser support
  preflightContinue: false,
  maxAge: 86400 // Cache preflight requests for 24 hours
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Limit request size
app.use(generalLimiter); // Apply general rate limiting to all routes

// Add database instance to request object
app.use((req, res, next) => {
  req.db = db;
  req.firebaseInitialized = firebaseInitialized;
  next();
});

// Routes with specific rate limiting
app.use('/api/auth', authLimiter, speedLimiter, require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/email', require('./routes/email'));
app.use('/api/faculty-requests', require('./routes/faculty-requests'));

// AI moderation routes
try {
  const aiModerationRoutes = require('./routes/aiModeration');
  app.use('/api/ai-moderation', aiModerationRoutes);
  console.log('✅ AI moderation routes initialized at /api/ai-moderation');
} catch (error) {
  console.error('❌ Failed to initialize AI moderation routes:', error.message);
}

// app.use('/api/moderation', require('./routes/moderation'));
//app.use('/api/enhanced-moderation', require('./routes/enhancedModeration'));

// Security check routes - for testing security measures
// Only available in development environment
if (process.env.NODE_ENV !== 'production') {
  const securityCheckRoutes = require('./routes/security-check');
  app.get('/security-check/xss', securityCheckRoutes.xssTest);
  app.get('/security-check/clickjack', securityCheckRoutes.clickjackTest);
  app.get('/security-check/mime', securityCheckRoutes.mimeSniffTest);
  app.get('/security-check/https', securityCheckRoutes.httpsTest);
  app.get('/security-check/headers', securityCheckRoutes.headersTest);
  console.log('✅ Security check routes enabled (development only)');
}

// Health check route
app.get('/', (req, res) => {
  res.send('BulSU Space API is running');
});
// Lightweight HEAD probe for frontend port auto-fallback logic (non-sensitive)
app.head('/api/health-dev-probe', (req, res) => res.status(204).end());

// Import auth security service
const authSecurity = require('./services/authSecurity');

// Setup scheduled cleanup of old login attempts (runs daily)
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RETENTION_DAYS = 30; // Keep login attempts for 30 days

setInterval(async () => {
  try {
    console.log('Running scheduled cleanup of old login attempts');
    const result = await authSecurity.cleanupOldAttempts(RETENTION_DAYS * 24 * 60 * 60 * 1000);
    console.log('Cleanup complete:', result);
  } catch (error) {
    console.error('Error during scheduled cleanup:', error);
  }
}, CLEANUP_INTERVAL_MS);

// Scheduled auto-delete of revoked users older than retention window
const REVOKED_RETENTION_DAYS = parseInt(process.env.REVOKED_RETENTION_DAYS || '10', 10);
setInterval(async () => {
  if (!firebaseInitialized) return; // Skip if no Firebase
  try {
    console.log('[AutoDeleteScheduler] Scanning for expired revoked users');
    const now = Date.now();
    const cutoffMs = REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const snapshot = await db.collection('users').where('revoked', '==', true).get();
    if (snapshot.empty) return;
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      let revokedAt = data.revokedAt;
      if (!revokedAt) {
        // Initialize revokedAt so countdown begins
        await docSnap.ref.update({ revokedAt: new Date().toISOString() });
        continue;
      }
      let revokedTime;
      try {
        revokedTime = revokedAt.toDate ? revokedAt.toDate().getTime() : new Date(revokedAt).getTime();
      } catch {
        continue;
      }
      if (now - revokedTime >= cutoffMs) {
        console.log('[AutoDeleteScheduler] Deleting expired revoked user', docSnap.id);
        try {
          await docSnap.ref.delete();
          try { await admin.auth().deleteUser(docSnap.id); } catch (e) { if (!String(e.code || '').includes('not-found')) console.error('Auth delete failed', e.message); }
        } catch (e) {
          console.error('[AutoDeleteScheduler] Failed deleting user', docSnap.id, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[AutoDeleteScheduler] Error during scan', e);
  }
}, CLEANUP_INTERVAL_MS); // reuse 24h interval

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port or stop the other process.`);
    // Try an alternative port
    const altPort = parseInt(PORT) + 1;
    console.log(`Attempting to use alternative port: ${altPort}`);
    app.listen(altPort, () => {
      console.log(`Server running on alternative port ${altPort}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
