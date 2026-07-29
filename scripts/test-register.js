require('dotenv').config();

const http = require('http');

// Test: institution_learner with EMPTY institutionId (empty string)
const payload = JSON.stringify({
  fullName: 'Test InstLearner',
  email: 'testinstlearner998@example.com',
  password: 'Password123!',
  confirmPassword: 'Password123!',
  registrationType: 'institution_learner',
  institutionId: ''
});

function makeRequest(payload) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('\n=== TEST: institution_learner with empty institutionId ===');
  try {
    const res = await makeRequest(payload);
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(res.body, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
