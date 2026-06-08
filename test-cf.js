const https = require('https');

const P1 = '8909645829'
const P2 = 'AAFMLlLxWkx'
const P3 = 'wxz0QJgeLoBT'
const P4 = '_LQhDbAK0NUw'
const TOKEN = `${P1}:${P2}${P3}${P4}`

console.log('Testing CF Mirror...');

const options = {
  hostname: 'tg-api.flowseal.workers.dev',
  port: 443,
  path: `/bot${TOKEN}/getMe`,
  method: 'GET',
  timeout: 5000
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => { console.log('BODY:', body); });
});

req.on('error', (e) => { console.error(`PROBLEM: ${e.message}`); });
req.on('timeout', () => { console.error('TIMEOUT'); req.destroy(); });

req.end();
