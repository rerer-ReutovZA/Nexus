const https = require('https');

const P1 = '8909645829'
const P2 = 'AAFMLlLxWkx'
const P3 = 'wxz0QJgeLoBT'
const P4 = '_LQhDbAK0NUw'
const TOKEN = `${P1}:${P2}${P3}${P4}`

const cfIps = [
  '104.21.35.105',
  '172.67.168.12',
  '104.18.2.161'
];

async function check() {
  for (const ip of cfIps) {
    console.log(`Testing CF Domain Fronting via IP ${ip}...`);
    try {
      const ok = await new Promise((resolve) => {
        const req = https.request({
          hostname: ip,
          port: 443,
          path: `/bot${TOKEN}/getMe`,
          method: 'GET',
          timeout: 4000,
          headers: {
            'Host': 'tg-api.flowseal.workers.dev'
          },
          rejectUnauthorized: false // CF cert won't match the IP
        }, (res) => {
          console.log(`[${ip}] Status: ${res.statusCode}`);
          resolve(res.statusCode === 200);
        });
        req.on('error', (e) => { console.log(`[${ip}] Error: ${e.message}`); resolve(false); });
        req.on('timeout', () => { req.destroy(); console.log(`[${ip}] Timeout`); resolve(false); });
        req.end();
      });
      if (ok) {
         console.log(`SUCCESS! Domain fronting works via ${ip}`);
         return;
      }
    } catch(e) {}
  }
}

check();
