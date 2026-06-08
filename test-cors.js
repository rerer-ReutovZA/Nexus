const https = require('https');
const P1 = '8909645829'
const P2 = 'AAFMLlLxWkx'
const P3 = 'wxz0QJgeLoBT'
const P4 = '_LQhDbAK0NUw'
const TOKEN = `${P1}:${P2}${P3}${P4}`

const targetUrl = encodeURIComponent(`https://api.telegram.org/bot${TOKEN}/getMe`);
const proxyUrl = `/raw?url=${targetUrl}`;

const req = https.request({
  hostname: 'api.allorigins.win',
  port: 443,
  path: proxyUrl,
  method: 'GET',
  timeout: 5000
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.on('error', (e) => console.error('Error:', e.message));
req.end();
