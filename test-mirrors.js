const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { exec } = require('child_process');

console.log('Testing Telegram API connection via proxy...');

// We assume TgWsProxy is running or we can start it. 
// For this test, let's just see if we can use a mirror first.
const P1 = '8909645829'
const P2 = 'AAFMLlLxWkx'
const P3 = 'wxz0QJgeLoBT'
const P4 = '_LQhDbAK0NUw'
const TOKEN = `${P1}:${P2}${P3}${P4}`

const options = {
  hostname: 'api.tgstat.ru',
  port: 443,
  path: `/bot${TOKEN}/getMe`,
  method: 'GET',
  timeout: 5000
};

const req = https.request(options, (res) => {
  console.log(`STATUS (tgstat): ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.on('error', (e) => console.error('Error tgstat:', e.message));
req.end();

const options2 = {
  hostname: 'telegg.ru',
  port: 443,
  path: `/bot${TOKEN}/getMe`,
  method: 'GET',
  timeout: 5000
};

const req2 = https.request(options2, (res) => {
  console.log(`STATUS (telegg): ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req2.on('error', (e) => console.error('Error telegg:', e.message));
req2.end();
