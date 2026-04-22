const axios = require('axios');
require('dotenv').config();

const url = process.env.PYTHON_API_URL || 'http://localhost:8000';
const token = process.env.INTERNAL_API_TOKEN || 'bot-tle-secret-key-123';

async function test() {
  console.log(`Connecting to ${url}/ping ...`);
  try {
    const res = await axios.get(`${url}/ping`);
    console.log('✅ Ping success:', res.data);
  } catch (err) {
    console.error('❌ Ping failed:', err.message);
  }

  console.log(`Connecting to ${url}/ai ...`);
  try {
    const res = await axios.post(`${url}/ai`, 
      { prompt: 'test' },
      { headers: { 'X-API-KEY': token } }
    );
    console.log('✅ AI success:', res.data);
  } catch (err) {
    console.error('❌ AI failed:', err.response?.status, err.response?.data || err.message);
  }
  console.log(`Connecting to ${url}/download/info ...`);
  try {
    const res = await axios.get(`${url}/download/info`, {
      params: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      headers: { 'X-API-KEY': token }
    });
    console.log('✅ Download Info success:', res.data.title);
  } catch (err) {
    console.error('❌ Download Info failed:', err.response?.status, err.response?.data || err.message);
  }
}

test();
