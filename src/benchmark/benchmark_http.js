import http from 'http';

const CONCURRENT_USERS = 300;
const TARGET_URL = 'http://localhost:8443/messages';
const BASE_URL = 'http://localhost:8443/api/v1';

const agent = new http.Agent({
    keepAlive: false
});

const TEST_USER = {
    username: 'ana_fuerte',
    password: 'Xk9$#vL8nR'
};

function getValidToken() {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(TEST_USER);
        const req = http.request(`${BASE_URL}/login`, {
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
                    const json = JSON.parse(data);
                    resolve(json.token);
                } else {
                    reject(new Error(`Login failed (HTTP ${res.statusCode}): ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function sendRequest(userId, token) {
    const startTime = Date.now();
    const payload = JSON.stringify({ message: `Test de carga usuario ${userId}` });

    return new Promise((resolve) => {
        const req = http.request(TARGET_URL, {
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
                    userId,
                    status: res.statusCode,
                    reply: parsedReply,
                    duration,
                    success: res.statusCode === 200
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                userId,
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

async function runBenchmark() {
    console.log(`Starting load test with ${CONCURRENT_USERS} concurrent HTTP users (no TLS)...`);
    const token = await getValidToken();
    const globalStart = Date.now();
   
    const promises = Array.from({ length: CONCURRENT_USERS }, (_, i) => sendRequest(i + 1, token));
    const results = await Promise.all(promises);

    const totalTime = Date.now() - globalStart;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgLatency = results.reduce((acc, r) => acc + r.duration, 0) / results.length;

    console.log("\n --- SERVER RESPONSES (HTTP) ---");
    results.forEach((r) => {
        if (r.success) {
            console.log(`[User ${r.userId}] Response (HTTP ${r.status}):`, r.reply);
        } else {
            console.log(`[User ${r.userId}] Failed (HTTP ${r.status}):`, r.error || r.reply);
        }
    });

    console.log("\n --- BENCHMARK's RESULTS (HTTP) ---");
    console.log(`Total users: ${CONCURRENT_USERS}`);
    console.log(`Succesful requests (200 OK): ${successful}`);
    console.log(`failed request: ${failed}`);
    console.log(`Total time: ${totalTime} ms`);
    console.log(`RTT average latency: ${avgLatency.toFixed(2)} ms`);
    console.log(`Throughput estimated: ${(CONCURRENT_USERS / (totalTime / 1000)).toFixed(2)} req/sec`);
}

runBenchmark();