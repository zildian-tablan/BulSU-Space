/**
 * Script to verify and update database rules to allow status writes
 */

const fs = require('fs');
const path = require('path');

// The correct rules that allow status path writes
const correctRules = {
  "rules": {
    "userCalls": {
      ".indexOn": ["caller", "callee"],
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || data.child('callee').val() === auth.uid)",
        ".write": "auth != null && (auth.uid === $uid || data.child('callee').val() === auth.uid)"
      }
    },
    "status": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid || auth != null"
      }
    },
    "connections": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid || auth != null"
      }
    },
    "bazooka": {
      ".read": true,
      ".write": true
    },
    ".read": "auth != null",
    ".write": "auth != null"
  }
};

// Path to the database rules file
const rulesPath = path.join(__dirname, 'database.rules.json');

// Read current rules
let currentRules = {};
try {
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  currentRules = JSON.parse(rulesContent);
  console.log("Current rules read from file:", rulesPath);
} catch (err) {
  console.error("Error reading rules file:", err);
  currentRules = { rules: {} };
}

// Print current rules
console.log("\nCURRENT RULES:");
console.log(JSON.stringify(currentRules, null, 2));

// Print correct rules
console.log("\nCORRECT RULES (that will allow status path writes):");
console.log(JSON.stringify(correctRules, null, 2));

// Write the updated rules
try {
  fs.writeFileSync(rulesPath, JSON.stringify(correctRules, null, 2));
  console.log("\nRules file updated successfully!");
  console.log("\nIMPORTANT: You must deploy these rules using Firebase CLI.");
  console.log("Run: firebase deploy --only database");
} catch (err) {
  console.error("Error writing rules file:", err);
}
