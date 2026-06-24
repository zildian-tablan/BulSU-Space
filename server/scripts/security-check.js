#!/usr/bin/env node
/**
 * Security Check Script
 * This script checks for common security issues in the codebase
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { execSync } = require('child_process');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const PROJECT_ROOT = path.join(ROOT_DIR, '..');

// Patterns to check for
const securityPatterns = [
  {
    name: 'API Keys',
    regex: /(api[_-]?key|apikey)\s*[=:]\s*['"]([a-zA-Z0-9_\-]{20,})['"]|['"]([a-zA-Z0-9_\-]{30,})['"]/gi,
    severity: 'HIGH'
  },
  {
    name: 'Firebase Service Account',
    regex: /serviceAccountKey\.json|credential:\s*admin\.credential\.cert\(/gi,
    severity: 'CRITICAL'
  },
  {
    name: 'SendGrid API Keys',
    regex: /SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}/gi,
    severity: 'CRITICAL'
  },
  {
    name: 'HuggingFace API Keys',
    regex: /hf_[a-zA-Z0-9]{34}/gi,
    severity: 'CRITICAL'
  },
  {
    name: 'Private Keys',
    regex: /BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY/gi,
    severity: 'CRITICAL'
  },
  {
    name: 'Passwords',
    regex: /password[=:]\s*['"](?!your-)[^'"]{6,}['"]/gi,
    severity: 'HIGH'
  },
  {
    name: 'Hardcoded Secrets',
    regex: /secret[=:]\s*['"](?!your-|replace_)[^'"]{8,}['"]/gi,
    severity: 'HIGH'
  }
];

// Files and directories to ignore
const ignorePatterns = [
  'node_modules',
  '.git',
  'build',
  'dist',
  '.env.example',
  'serviceAccountKey.template.json',
  'SECURITY_SETUP.md',
  'rotate-keys.js',
  'security-check.js'
];

// Check if a path should be ignored
function shouldIgnore(filePath) {
  return ignorePatterns.some(pattern => filePath.includes(pattern));
}

// Get all files recursively
function getAllFiles(dir, fileList = []) {
  if (shouldIgnore(dir)) return fileList;
  
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    
    if (shouldIgnore(filePath)) return;
    
    if (fs.statSync(filePath).isDirectory()) {
      fileList = getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Check a file for security issues
function checkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`File not found: ${filePath}`));
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  securityPatterns.forEach(pattern => {
    const matches = content.match(pattern.regex);
    
    if (matches) {
      matches.forEach(match => {
        issues.push({
          file: filePath,
          pattern: pattern.name,
          match: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
          severity: pattern.severity
        });
      });
    }
  });
  
  return issues;
}

// Main function
function runSecurityCheck() {
  console.log(chalk.blue.bold('========================================'));
  console.log(chalk.blue.bold('    BulSU Space Security Check Tool    '));
  console.log(chalk.blue.bold('========================================\n'));
  
  console.log(chalk.yellow('Scanning for security issues...\n'));
  
  // Check for .env file
  if (!fs.existsSync(path.join(ROOT_DIR, '.env'))) {
    console.log(chalk.red('⚠️ No .env file found. You should create one from .env.example'));
  } else {
    console.log(chalk.green('✅ .env file exists'));
  }
  
  // Check for gitignore entries
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('serviceAccountKey.json')) {
      console.log(chalk.red('⚠️ serviceAccountKey.json not found in .gitignore!'));
    } else {
      console.log(chalk.green('✅ serviceAccountKey.json is in .gitignore'));
    }
    
    if (!gitignore.includes('.env')) {
      console.log(chalk.red('⚠️ .env not found in .gitignore!'));
    } else {
      console.log(chalk.green('✅ .env is in .gitignore'));
    }
  } else {
    console.log(chalk.red('⚠️ No .gitignore file found!'));
  }
  
  // Check if actual serviceAccountKey.json exists
  const serviceAccountPath = path.join(ROOT_DIR, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    console.log(chalk.red('⚠️ CRITICAL SECURITY ISSUE: serviceAccountKey.json exists and could be committed!'));
    console.log(chalk.red('   You should delete this file and use environment variables instead.'));
  } else {
    console.log(chalk.green('✅ No serviceAccountKey.json file found (good)'));
  }
  
  console.log(chalk.yellow('\nScanning files for potential secrets...'));
  
  // Get all files and check each one
  const files = getAllFiles(PROJECT_ROOT);
  let issues = [];
  
  files.forEach(file => {
    const fileIssues = checkFile(file);
    issues = issues.concat(fileIssues);
  });
  
  // Report issues
  if (issues.length === 0) {
    console.log(chalk.green('\n✅ No potential secrets found in code scan'));
  } else {
    console.log(chalk.red(`\n⚠️ Found ${issues.length} potential security issues:`));
    
    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
    const highIssues = issues.filter(i => i.severity === 'HIGH');
    
    if (criticalIssues.length > 0) {
      console.log(chalk.bgRed.white('\nCRITICAL ISSUES:'));
      criticalIssues.forEach(issue => {
        console.log(chalk.red(`- ${issue.pattern} in ${path.relative(PROJECT_ROOT, issue.file)}`));
        console.log(`  ${issue.match}`);
      });
    }
    
    if (highIssues.length > 0) {
      console.log(chalk.bgYellow.black('\nHIGH SEVERITY ISSUES:'));
      highIssues.forEach(issue => {
        console.log(chalk.yellow(`- ${issue.pattern} in ${path.relative(PROJECT_ROOT, issue.file)}`));
        console.log(`  ${issue.match}`);
      });
    }
  }
  
  console.log(chalk.blue.bold('\n========================================'));
  console.log(chalk.blue.bold('       Security Check Complete          '));
  console.log(chalk.blue.bold('========================================\n'));
}

// Run the script
runSecurityCheck();
