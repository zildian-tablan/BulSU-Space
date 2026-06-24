// server/routes/aiModeration.js
const express = require('express');
const router = express.Router();
const { moderateWithOpenAI } = require('../services/aiModerationService');

router.post('/', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing text' });
  }
  
  try {
    const result = await moderateWithOpenAI(text);
    res.json(result);
  } catch (err) {
    console.error('AI moderation error:', err.message);
    
    // If it's a quota error, don't fail the request but log and return not flagged
    if (err.message && (
        err.message.includes('quota') || 
        err.message.includes('rate limit') || 
        err.message.includes('429')
    )) {
      console.warn('OpenAI API quota exceeded. Proceeding without moderation.');
      return res.json({ 
        flagged: false, 
        reason: 'AI moderation skipped (quota exceeded)' 
      });
    }
    
    // For other errors, return an error response
    res.status(500).json({ error: 'AI moderation failed: ' + err.message });
  }
});

module.exports = router; 