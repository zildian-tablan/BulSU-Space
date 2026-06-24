// server/services/aiModerationService.js
const axios = require('axios');

async function moderateWithOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not set');
  }
  
  try {
    const response = await axios.post('https://api.openai.com/v1/moderations', 
      { input: text },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        }
      }
    );
    
    if (response.data.results && response.data.results[0].flagged) {
      return { 
        flagged: true, 
        reason: response.data.results[0].categories 
      };
    }
    return { flagged: false };
  } catch (error) {
    console.error('OpenAI moderation API error:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    throw new Error(`OpenAI moderation failed: ${error.message}`);
  }
}

module.exports = { moderateWithOpenAI }; 