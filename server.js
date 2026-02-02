/**
 * HTTPS 静的ファイルサーバー（Node.js https モジュール使用）
 *
 * 自己署名証明書（key.pem / cert.pem）を自動生成し、
 * ブラウザで「詳細設定」→「安全でないページに進む」を選べるタイプの
 * 警告画面にします。Quest 3 で「このサイトは安全に接続できません」と
 * 出た場合も、画面の「詳細」や「詳細設定」から進むを選択すれば続行できます。
 *
 * 証明書は初回起動時に cert/ に保存され、2回目以降は同じ証明書を使います。
 *
 * 【起動方法】
 *   プロジェクトのフォルダで:
 *     npm install   （初回のみ）
 *     node server.js   または  npm start
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const express = require('express');

const PORT = process.env.PORT || 3000;
const CERT_DIR = path.join(__dirname, 'cert');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

function getLocalIPs() {
  const ips = ['127.0.0.1'];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return [...new Set(ips)];
}

function ensureCertDir() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    console.log('証明書用フォルダ cert/ を作成しました');
  }
}

/**
 * 自己署名証明書を生成し、cert/key.pem と cert/cert.pem に保存する。
 * SAN に localhost と全ローカル IP を含め、Quest から IP でアクセスしても
 * 「証明書のドメイン不一致」でブロックされず、警告から進めるようにする。
 */
function generateAndSaveCert() {
  const selfsigned = require('selfsigned');
  ensureCertDir();

  const ips = getLocalIPs();
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.filter(ip => ip !== '127.0.0.1').map(ip => ({ type: 7, ip }))
  ];

  const cert = selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    {
      days: 365,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames }]
    }
  );

  fs.writeFileSync(KEY_PATH, cert.private, 'utf8');
  fs.writeFileSync(CERT_PATH, cert.cert, 'utf8');
  console.log('自己署名証明書を生成し、cert/key.pem と cert/cert.pem に保存しました');
  return { key: cert.private, cert: cert.cert };
}

function getHttpsOptions() {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    console.log('証明書: cert/key.pem と cert/cert.pem を使用します');
    return {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH)
    };
  }
  return generateAndSaveCert();
}

const app = express();
app.use(express.static(__dirname));

const options = getHttpsOptions();
const server = https.createServer(options, app);

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs().filter(ip => ip !== '127.0.0.1');
  console.log('');
  console.log('  HTTPS サーバー起動（自己署名証明書）');
  console.log('  -------------------------------------');
  console.log(`  https://localhost:${PORT}`);
  if (ips.length) {
    ips.forEach(ip => console.log(`  https://${ip}:${PORT}  ← Quest 3 はこのアドレスでアクセス`));
  }
  console.log('');
  console.log('  Quest で「このサイトは安全に接続できません」と出た場合:');
  console.log('  「詳細」または「詳細設定」→「安全でないページに進む」を選んでください。');
  console.log('');
});
