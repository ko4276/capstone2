// Node (dev only)
const { Keypair, Transaction, Connection } = require('@solana/web3.js');
const fetch = require('node-fetch');

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const secret = Uint8Array.from(JSON.parse(require('fs').readFileSync('devkey.json', 'utf8')));
const kp = Keypair.fromSecretKey(secret);

const tx = new Transaction();
// tx.add( ...instruction... );
tx.feePayer = kp.publicKey;
tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

tx.sign(kp);
const base64 = Buffer.from(tx.serialize()).toString('base64');

await fetch('http://localhost:3002/api/transactions/send-raw', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ transactionBase64: base64 })
});