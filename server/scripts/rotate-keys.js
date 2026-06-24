#!/usr/bin/env node
/**
 * Security Key Rotation Script
 * This script helps users rotate security keys after previous ones were exposed
 */

const chalk = require('chalk');
const prompts = require('prompts');
const fs = require('fs');
const path = require('path');
const open = require('open');
const dotenv = require('dotenv');

// Configuration
const ENV_FILE_PATH = path.join(__dirname, '../.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '../.env.example');

// Function to check if .env file exists
function checkEnvFile() {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    console.log(chalk.yellow('No .env file found. Creating one from .env.example...'));
    if (fs.existsSync(ENV_EXAMPLE_PATH)) {
      fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_FILE_PATH);
      console.log(chalk.green('Created .env file from example template.'));
    } else {
      console.log(chalk.red('Error: .env.example file not found. Please create a .env file manually.'));
      process.exit(1);
    }
  }
}

// Load the current environment variables
function loadEnvVars() {
  checkEnvFile();
  return dotenv.parse(fs.readFileSync(ENV_FILE_PATH));
}

// Update an environment variable
function updateEnvVar(envVars, key, value) {
  envVars[key] = value;
  saveEnvVars(envVars);
}

// Save environment variables back to .env
function saveEnvVars(envVars) {
  const envContent = Object.entries(envVars)
    .map(([key, val]) => `${key}=${val}`)
    .join('\n');
  fs.writeFileSync(ENV_FILE_PATH, envContent);
}

// Main function to rotate keys
async function rotateKeys() {
  console.log(chalk.blue.bold('==================================================='));
  console.log(chalk.blue.bold('       BulSU Space - Security Key Rotation         '));
  console.log(chalk.blue.bold('==================================================='));
  console.log(chalk.yellow('This script will help you rotate exposed security keys'));
  console.log(chalk.yellow('and properly configure your environment variables.'));
  console.log('\n');

  const envVars = loadEnvVars();

  const choices = [
    { title: 'Firebase Service Account', value: 'firebase' },
    { title: 'SendGrid API Key', value: 'sendgrid' },
    { title: 'HuggingFace API Key', value: 'huggingface' },
    { title: 'All Keys (recommended after credential exposure)', value: 'all' },
    { title: 'Exit', value: 'exit' }
  ];

  const response = await prompts({
    type: 'select',
    name: 'action',
    message: 'What keys would you like to rotate?',
    choices
  });

  switch (response.action) {
    case 'firebase':
      await rotateFirebaseKeys();
      break;
    case 'sendgrid':
      await rotateSendGridKey();
      break;
    case 'huggingface':
      await rotateHuggingFaceKey();
      break;
    case 'all':
      await rotateFirebaseKeys();
      await rotateSendGridKey();
      await rotateHuggingFaceKey();
      break;
    case 'exit':
    default:
      console.log(chalk.green('Exiting key rotation script.'));
      break;
  }
}

// Function to rotate Firebase keys
async function rotateFirebaseKeys() {
  console.log(chalk.blue.bold('\n=== Firebase Service Account Key Rotation ==='));
  
  console.log(chalk.yellow('Follow these steps to generate a new Firebase service account key:'));
  console.log('1. Go to Firebase Console > Project Settings > Service Accounts');
  console.log('2. Click "Generate new private key"');
  console.log('3. Download the JSON file');
  console.log('4. Extract the required values from the JSON file');
  
  const openConsole = await prompts({
    type: 'confirm',
    name: 'open',
    message: 'Open Firebase Console in your browser now?',
    initial: true
  });
  
  if (openConsole.open) {
    await open('https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk');
  }
  
  console.log(chalk.green('\nAfter downloading the new key, please enter the values below:'));
  
  const firebaseConfig = await prompts([
    {
      type: 'text',
      name: 'projectId',
      message: 'Project ID:',
      initial: process.env.FIREBASE_PROJECT_ID || ''
    },
    {
      type: 'text',
      name: 'clientEmail',
      message: 'Client Email:',
      initial: process.env.FIREBASE_CLIENT_EMAIL || ''
    },
    {
      type: 'text',
      name: 'privateKeyId',
      message: 'Private Key ID:',
      initial: process.env.FIREBASE_PRIVATE_KEY_ID || ''
    },
    {
      type: 'text',
      name: 'privateKey',
      message: 'Private Key (starts with -----BEGIN PRIVATE KEY-----):',
      initial: process.env.FIREBASE_PRIVATE_KEY || ''
    }
  ]);
  
  // Update environment variables
  const envVars = loadEnvVars();
  updateEnvVar(envVars, 'FIREBASE_PROJECT_ID', firebaseConfig.projectId);
  updateEnvVar(envVars, 'FIREBASE_CLIENT_EMAIL', firebaseConfig.clientEmail);
  updateEnvVar(envVars, 'FIREBASE_PRIVATE_KEY_ID', firebaseConfig.privateKeyId);
  updateEnvVar(envVars, 'FIREBASE_PRIVATE_KEY', firebaseConfig.privateKey);
  
  console.log(chalk.green('\nFirebase service account keys updated successfully!'));
  console.log(chalk.yellow('IMPORTANT: Delete the downloaded JSON file after extracting the values.'));
}

// Function to rotate SendGrid API key
async function rotateSendGridKey() {
  console.log(chalk.blue.bold('\n=== SendGrid API Key Rotation ==='));
  
  console.log(chalk.yellow('Follow these steps to generate a new SendGrid API key:'));
  console.log('1. Go to SendGrid Dashboard > Settings > API Keys');
  console.log('2. Click "Create API Key"');
  console.log('3. Give it a name and select appropriate permissions');
  console.log('4. Copy the generated API key (you will only see it once!)');
  
  const openConsole = await prompts({
    type: 'confirm',
    name: 'open',
    message: 'Open SendGrid Dashboard in your browser now?',
    initial: true
  });
  
  if (openConsole.open) {
    await open('https://app.sendgrid.com/settings/api_keys');
  }
  
  const sendgridConfig = await prompts({
    type: 'text',
    name: 'apiKey',
    message: 'New SendGrid API Key:',
    initial: ''  // Don't show current value for security
  });
  
  // Update environment variables
  const envVars = loadEnvVars();
  updateEnvVar(envVars, 'SENDGRID_API_KEY', sendgridConfig.apiKey);
  
  console.log(chalk.green('\nSendGrid API key updated successfully!'));
}

// Function to rotate HuggingFace API key
async function rotateHuggingFaceKey() {
  console.log(chalk.blue.bold('\n=== HuggingFace API Key Rotation ==='));
  
  console.log(chalk.yellow('Follow these steps to generate a new HuggingFace API token:'));
  console.log('1. Go to HuggingFace > Settings > Access Tokens');
  console.log('2. Click "New token"');
  console.log('3. Give it a name and select appropriate role');
  console.log('4. Copy the generated token');
  
  const openConsole = await prompts({
    type: 'confirm',
    name: 'open',
    message: 'Open HuggingFace Settings in your browser now?',
    initial: true
  });
  
  if (openConsole.open) {
    await open('https://huggingface.co/settings/tokens');
  }
  
  const huggingfaceConfig = await prompts({
    type: 'text',
    name: 'apiKey',
    message: 'New HuggingFace API Key:',
    initial: ''  // Don't show current value for security
  });
  
  // Update environment variables
  const envVars = loadEnvVars();
  updateEnvVar(envVars, 'HUGGINGFACE_API_KEY', huggingfaceConfig.apiKey);
  
  console.log(chalk.green('\nHuggingFace API key updated successfully!'));
}

// Run the script
rotateKeys().catch(err => {
  console.error(chalk.red('Error:'), err);
  process.exit(1);
});
