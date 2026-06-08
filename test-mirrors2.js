const https = require('https');
const P1 = '8909645829'
const P2 = 'AAFMLlLxWkx'
const P3 = 'wxz0QJgeLoBT'
const P4 = '_LQhDbAK0NUw'
const TOKEN = `${P1}:${P2}${P3}${P4}`

const mirrors = [
  'api.telegram.org',
  'api.tgstat.ru',
  'api.telegram-proxy.org',
  'telegg.ru',
  'tapi.bota.ru',
  'tg.dev',
  'api.telegram.dog'
];

async function check() {
  for (const host of mirrors) {
    console.log(`Checking ${host}...`);
    try {
      const ok = await new Promise((resolve) => {
        const req = https.get(`https://${host}/bot${TOKEN}/getMe`, { timeout: 3000 }, (res) => {
          console.log(`[${host}] Status: ${res.statusCode}`);
          resolve(res.statusCode === 200);
        });
        req.on('error', (e) => { console.log(`[${host}] Error: ${e.message}`); resolve(false); });
        req.on('timeout', () => { req.destroy(); console.log(`[${host}] Timeout`); resolve(false); });
      });
      if (ok) console.log(`SUCCESS: ${host} works!`);
    } catch(e) {}
  }
}

check();
