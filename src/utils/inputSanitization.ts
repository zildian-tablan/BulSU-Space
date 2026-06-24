import DOMPurify from 'dompurify';
import { SecurityLogger } from './securityUtils';

interface SanitizationConfig {
  allowedTags: string[];
  allowedAttributes: { [key: string]: string[] };
  allowedSchemes: string[];
  maxLength: number;
  stripScripts: boolean;
  stripComments: boolean;
  preserveComments: boolean;
}

interface ValidationRule {
  pattern: RegExp;
  message: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue: string;
  originalValue: string;
}

/**
 * Comprehensive input sanitization and validation system
 */
export class InputSanitizer {
  private static readonly DEFAULT_CONFIG: SanitizationConfig = {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'code', 'pre'
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'target'],
      'img': ['src', 'alt', 'width', 'height'],
      'blockquote': ['cite'],
      'code': ['class'],
      'pre': ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    maxLength: 10000,
    stripScripts: true,
    stripComments: true,
    preserveComments: false
  };

  private static config: SanitizationConfig = this.DEFAULT_CONFIG;
  /**
   * Initialize DOMPurify with security configurations
   */
  static initialize(): void {
    try {
      // Note: DOMPurify configuration is done per-sanitization call, not globally
      console.log('[InputSanitizer] Initialized successfully');
    } catch (error) {
      console.error('[InputSanitizer] Initialization error:', error);
      SecurityLogger.logSecurityEvent('sanitizer_initialization_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Sanitize HTML content
   */
  static sanitizeHTML(input: string): string {
    try {
      if (!input || typeof input !== 'string') {
        return '';
      }

      // Check input length
      if (input.length > this.config.maxLength) {
        SecurityLogger.logSecurityEvent('sanitization_length_exceeded', {
          inputLength: input.length,
          maxLength: this.config.maxLength
        });
        input = input.substring(0, this.config.maxLength);
      }

      // Sanitize with DOMPurify
      const sanitized = DOMPurify.sanitize(input, {
        ALLOWED_TAGS: this.config.allowedTags,
        ALLOWED_ATTR: Object.values(this.config.allowedAttributes).flat(),
        KEEP_CONTENT: true
      });

      // Log if content was modified
      if (sanitized !== input) {
        SecurityLogger.logSecurityEvent('content_sanitized', {
          originalLength: input.length,
          sanitizedLength: sanitized.length,
          wasModified: true
        });
      }

      return sanitized;
    } catch (error) {
      console.error('[InputSanitizer] HTML sanitization error:', error);
      SecurityLogger.logSecurityEvent('sanitization_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        inputType: 'html'
      });
      return '';
    }
  }

  /**
   * Sanitize plain text
   */
  static sanitizeText(input: string): string {
    try {
      if (!input || typeof input !== 'string') {
        return '';
      }

      // Remove HTML tags and entities
      let sanitized = input
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&[#\w]+;/g, '') // Remove HTML entities
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .trim();

      // Check length
      if (sanitized.length > this.config.maxLength) {
        sanitized = sanitized.substring(0, this.config.maxLength);
      }

      return sanitized;
    } catch (error) {
      console.error('[InputSanitizer] Text sanitization error:', error);
      return '';
    }
  }

  /**
   * Sanitize URL
   */
  static sanitizeURL(input: string): string {
    try {
      if (!input || typeof input !== 'string') {
        return '';
      }

      // Basic URL sanitization
      const trimmed = input.trim();
      
      // Check for allowed schemes
      const hasAllowedScheme = this.config.allowedSchemes.some(scheme => 
        trimmed.toLowerCase().startsWith(`${scheme}:`)
      );

      if (!hasAllowedScheme) {
        SecurityLogger.logSecurityEvent('url_blocked_invalid_scheme', {
          url: trimmed,
          allowedSchemes: this.config.allowedSchemes
        });
        return '';
      }

      // Additional URL validation
      try {
        const url = new URL(trimmed);
        return url.href;
      } catch (urlError) {
        SecurityLogger.logSecurityEvent('url_blocked_invalid_format', {
          url: trimmed
        });
        return '';
      }
    } catch (error) {
      console.error('[InputSanitizer] URL sanitization error:', error);
      return '';
    }
  }

  /**
   * Validate and sanitize input based on rules
   */
  static validateAndSanitize(
    input: string,
    rules: ValidationRule,
    sanitizationType: 'html' | 'text' | 'url' = 'text'
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      sanitizedValue: '',
      originalValue: input
    };

    try {
      // Check if required
      if (rules.required && (!input || input.trim().length === 0)) {
        result.errors.push('This field is required');
        result.isValid = false;
        return result;
      }

      // Sanitize based on type
      let sanitized: string;
      switch (sanitizationType) {
        case 'html':
          sanitized = this.sanitizeHTML(input);
          break;
        case 'url':
          sanitized = this.sanitizeURL(input);
          break;
        default:
          sanitized = this.sanitizeText(input);
      }

      result.sanitizedValue = sanitized;

      // Check length constraints
      if (rules.minLength && sanitized.length < rules.minLength) {
        result.errors.push(`Minimum length is ${rules.minLength} characters`);
        result.isValid = false;
      }

      if (rules.maxLength && sanitized.length > rules.maxLength) {
        result.errors.push(`Maximum length is ${rules.maxLength} characters`);
        result.isValid = false;
      }

      // Check pattern
      if (rules.pattern && !rules.pattern.test(sanitized)) {
        result.errors.push(rules.message);
        result.isValid = false;
      }

      // Log validation failures
      if (!result.isValid) {
        SecurityLogger.logSecurityEvent('input_validation_failed', {
          sanitizationType,
          errors: result.errors,
          inputLength: input.length,
          sanitizedLength: sanitized.length
        });
      }

    } catch (error) {
      console.error('[InputSanitizer] Validation error:', error);
      result.isValid = false;
      result.errors.push('Validation error occurred');
      SecurityLogger.logSecurityEvent('validation_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return result;
  }

  /**
   * Common validation rules
   */
  static readonly VALIDATION_RULES = {
    email: {
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Please enter a valid email address',
      maxLength: 254
    },
    password: {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
      minLength: 8,
      maxLength: 128
    },
    name: {
      pattern: /^[a-zA-Z\s\-\.]{2,}$/,
      message: 'Name must contain only letters, spaces, hyphens, and periods',
      minLength: 2,
      maxLength: 100
    },
    idNumber: {
      pattern: /^[A-Z0-9\-]{6,15}$/,
      message: 'Invalid ID number format',
      minLength: 6,
      maxLength: 15
    },
    phoneNumber: {
      pattern: /^[\+]?[1-9][\d]{0,15}$/,
      message: 'Please enter a valid phone number',
      minLength: 10,
      maxLength: 16
    },
    url: {
      pattern: /^https?:\/\/.+$/,
      message: 'Please enter a valid URL starting with http:// or https://',
      maxLength: 2048
    }
  };
  /**
   * Sanitize object properties
   */
  static sanitizeObject<T extends Record<string, any>>(
    obj: T,
    sanitizationMap: { [K in keyof T]?: 'html' | 'text' | 'url' }
  ): T {
    const sanitized = { ...obj } as any;

    for (const [key, type] of Object.entries(sanitizationMap)) {
      if (sanitized[key] && typeof sanitized[key] === 'string') {
        switch (type) {
          case 'html':
            sanitized[key] = this.sanitizeHTML(sanitized[key]);
            break;
          case 'url':
            sanitized[key] = this.sanitizeURL(sanitized[key]);
            break;
          default:
            sanitized[key] = this.sanitizeText(sanitized[key]);
        }
      }
    }

    return sanitized as T;
  }

  /**
   * Detect potential XSS attempts
   */
  static detectXSS(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
      /vbscript:/gi,
      /data:text\/html/gi
    ];

    const hasXSS = xssPatterns.some(pattern => pattern.test(input));
    
    if (hasXSS) {
      SecurityLogger.logSecurityEvent('xss_attempt_detected', {
        inputLength: input.length,
        patterns: xssPatterns.filter(p => p.test(input)).map(p => p.source)
      });
    }

    return hasXSS;
  }

  /**
   * Detect SQL injection attempts
   */
  static detectSQLInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
      /('|(\\')|(;)|(--)|(\|)|(\*)|(\%))/g,
      /(\b(or|and)\b.*?[=<>])/gi,
      /(\b(information_schema|sysobjects|systables)\b)/gi
    ];

    const hasSQLInjection = sqlPatterns.some(pattern => pattern.test(input));
    
    if (hasSQLInjection) {
      SecurityLogger.logSecurityEvent('sql_injection_attempt_detected', {
        inputLength: input.length,
        patterns: sqlPatterns.filter(p => p.test(input)).map(p => p.source)
      });
    }

    return hasSQLInjection;
  }

  /**
   * Comprehensive threat detection
   */
  static detectThreats(input: string): {
    hasXSS: boolean;
    hasSQLInjection: boolean;
    hasThreats: boolean;
    threatTypes: string[];
  } {
    const hasXSS = this.detectXSS(input);
    const hasSQLInjection = this.detectSQLInjection(input);
    const threatTypes: string[] = [];

    if (hasXSS) threatTypes.push('XSS');
    if (hasSQLInjection) threatTypes.push('SQL_INJECTION');

    const hasThreats = threatTypes.length > 0;

    if (hasThreats) {
      SecurityLogger.logSecurityEvent('multiple_threats_detected', {
        threatTypes,
        inputLength: input.length
      });
    }

    return {
      hasXSS,
      hasSQLInjection,
      hasThreats,
      threatTypes
    };
  }

  /**
   * Update sanitization configuration
   */
  static updateConfig(newConfig: Partial<SanitizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initialize(); // Reinitialize with new config
    console.log('[InputSanitizer] Configuration updated');
  }

  /**
   * Get current configuration
   */
  static getConfig(): SanitizationConfig {
    return { ...this.config };
  }
}

/**
 * React hook for input sanitization
 */
export const useInputSanitization = () => {
  React.useEffect(() => {
    InputSanitizer.initialize();
  }, []);

  const sanitize = React.useCallback((
    input: string,
    type: 'html' | 'text' | 'url' = 'text'
  ): string => {
    switch (type) {
      case 'html':
        return InputSanitizer.sanitizeHTML(input);
      case 'url':
        return InputSanitizer.sanitizeURL(input);
      default:
        return InputSanitizer.sanitizeText(input);
    }
  }, []);

  const validate = React.useCallback((
    input: string,
    rules: ValidationRule,
    type: 'html' | 'text' | 'url' = 'text'
  ): ValidationResult => {
    return InputSanitizer.validateAndSanitize(input, rules, type);
  }, []);

  const detectThreats = React.useCallback((input: string) => {
    return InputSanitizer.detectThreats(input);
  }, []);

  return {
    sanitize,
    validate,
    detectThreats,
    rules: InputSanitizer.VALIDATION_RULES
  };
};

// Add React import
import React from 'react';
