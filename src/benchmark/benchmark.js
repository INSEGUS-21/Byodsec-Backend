import https from 'https';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const BASE_URL = 'https://localhost:8443/api/v1';
const TARGET_URL = 'https://localhost:8443/messages';
const CA_CERT = fs.readFileSync('./src/certs/ca.crt');
const CSV_PATH = path.resolve('./data/usersData.csv');

function loadUsersFromCSV() {
    return new Promise((resolve, reject) => {
        const users = [];
        fs.createReadStream(CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                if (row.username && row.password) {
                    users.push(row);
                }
            })
            .on('end', () => resolve(users))
            .on('error', reject);
    });
}

function loginUser(user) {
    return new Promise((resolve, reject) => {
        const certPath = path.resolve(`./users_certs/${user.username}.p12`);
        if (!fs.existsSync(certPath)) {
            return reject(new Error(`Certificado no encontrado para ${user.username} en ${certPath}`));
        }

        const agent = new https.Agent({
            ca: CA_CERT,
            pfx: fs.readFileSync(certPath),
            passphrase: user.password,
            rejectUnauthorized: true,
            keepAlive: false
        });

        const payload = JSON.stringify({ username: user.username, password: user.password });
        const req = https.request(`${BASE_URL}/login`, {
            method: 'POST',
            agent: agent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve({ token: json.token, agent });
                    } catch (e) {
                        reject(new Error(`Respuesta JSON inválida en login para ${user.username}`));
                    }
                } else {
                    reject(new Error(`Login fallido para ${user.username} (HTTP ${res.statusCode}): ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function sendRequest(user, token, agent) {
    const startTime = Date.now();
    const payload = JSON.stringify({ message: `Test de carga usuario ${user.username}` });

    return new Promise((resolve) => {
        const req = https.request(TARGET_URL, {
            method: 'POST',
            agent: agent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                let parsedReply = data;

                try {
                    const json = JSON.parse(data);
                    parsedReply = json.reply || json.message || data;
                } catch (e) {
                    parsedReply = data;
                }

                resolve({
                    username: user.username,
                    status: res.statusCode,
                    reply: parsedReply,
                    duration,
                    success: res.statusCode === 200
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                username: user.username,
                status: 'ERROR',
                error: err.message,
                reply: null,
                duration: Date.now() - startTime,
                success: false
            });
        });

        req.write(payload);
        req.end();
    });
}

async function executeUserFlow(user) {
    try {
        const { token, agent } = await loginUser(user);
        return await sendRequest(user, token, agent);
    } catch (err) {
        return {
            username: user.username,
            status: 'ERROR',
            error: err.message,
            reply: null,
            duration: 0,
            success: false
        };
    }
}

async function runBenchmark() {
    const users = await loadUsersFromCSV();
    console.log(`Starting load test with ${users.length} unique concurrent mTLS users...`);
    const globalStart = Date.now();

    const results = await Promise.all(users.map(user => executeUserFlow(user)));

    const totalTime = Date.now() - globalStart;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgLatency = results.reduce((acc, r) => acc + r.duration, 0) / results.length;

    console.log("\n --- SERVER RESPONSES ---");
    results.forEach((r) => {
        if (r.success) {
            console.log(`[User ${r.username}] Response (HTTP ${r.status}):`, r.reply);
        } else {
            console.log(`[User ${r.username}] Failed (HTTP ${r.status}):`, r.error || r.reply);
        }
    });

    console.log("\n --- BENCHMARK's RESULTS ---");
    console.log(`Total users: ${users.length}`);
    console.log(`Succesful requests (200 OK): ${successful}`);
    console.log(`failed request: ${failed}`);
    console.log(`Total time: ${totalTime} ms`);
    console.log(`RTT average latency: ${avgLatency.toFixed(2)} ms`);
    console.log(`Throughput estimated: ${(users.length / (totalTime / 1000)).toFixed(2)} req/sec`);
}

runBenchmark();