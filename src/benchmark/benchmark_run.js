import { spawn, execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import pidusage from 'pidusage';

const LOG_DIR = './log';
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const logPath = `${LOG_DIR}/benchmark_${Date.now()}.log`;
const csvPath = `${LOG_DIR}/metrics.csv`;
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

if (!fs.existsSync(csvPath)) {
    const headers = 'timestamp,total_users,successful,failed,total_time_ms,avg_latency_ms,throughput_req_sec,peak_ram_mb,avg_cpu_percent,peak_cpu_percent\n';
    fs.writeFileSync(csvPath, headers, 'utf8');
}

function waitForServer(url, isHttps = true, maxAttempts = 30, interval = 1000) {
    const client = isHttps ? https : http;
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const check = () => {
            attempts++;
            const req = client.request(url, { method: 'GET', rejectUnauthorized: false }, () => {
                resolve();
            });

            req.on('error', (err) => {
                if (attempts >= maxAttempts) {
                    reject(new Error(`Servidor no disponible tras ${maxAttempts} segundos: ${err.message}`));
                } else {
                    setTimeout(check, interval);
                }
            });

            req.end();
        };

        check();
    });
}

async function run() {
    let server;
    try {
        console.log('[1/5] Starting server...');
        server = spawn('node', ['./src/index.js']);
        console.log('Waiting for server readiness...');
        await waitForServer('https://localhost:8080/api/v1/Users', true);
        console.log('Server is online and ready!');

        console.log('[2/5] Deleting users...');
        await new Promise((resolve, reject) => {
            const req = https.request('https://localhost:8080/api/v1/Users', { 
                method: 'DELETE',
                rejectUnauthorized: false 
            }, (res) => {
                if (res.statusCode === 200) {
                    console.log(`Users deleted successfully (HTTP ${res.statusCode})`);
                    resolve();
                } else {
                    reject(new Error(`Delete failed with HTTP status ${res.statusCode}`));
                }
            });
            req.on('error', (err) => reject(new Error(`Delete request failed: ${err.message}`)));
            req.end();
        });

        console.log('[3/5] Seeding database...');
        execSync('npm run seed', { stdio: 'inherit' });

        console.log(`[4/5] Running benchmark (Logs: ${logPath})...`);
        const statsHistory = [];
        const monitorInterval = setInterval(async () => {
            if (server && server.pid) {
                try {
                    const stats = await pidusage(server.pid);
                    statsHistory.push(stats);
                } catch (e) {
                }
            }
        }, 500);

        let benchmarkOutput = '';
        await new Promise((resolve, reject) => {
            const bench = spawn('node', ['./src/benchmark/benchmark.js']);
            bench.stdout.on('data', (data) => { 
                const str = data.toString();
                benchmarkOutput += str;
                process.stdout.write(data); 
                logStream.write(data); 
            });
            bench.stderr.on('data', (data) => { 
                process.stderr.write(data); 
                logStream.write(data); 
            });
            bench.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Benchmark failed with exit code ${code}`));
            });
        });

        clearInterval(monitorInterval);

        let maxRamMB = '0.00';
        let avgCpu = '0.00';
        let maxCpu = '0.00';

        if (statsHistory.length > 0) {
            maxRamMB = (Math.max(...statsHistory.map(s => s.memory)) / (1024 * 1024)).toFixed(2);
            avgCpu = (statsHistory.reduce((acc, s) => acc + s.cpu, 0) / statsHistory.length).toFixed(2);
            maxCpu = Math.max(...statsHistory.map(s => s.cpu)).toFixed(2);

            const metricsSummary = `
            --- SERVER RESOURCE USAGE ---
            Peak RAM Usage : ${maxRamMB} MB
            Average CPU    : ${avgCpu} %
            Peak CPU       : ${maxCpu} %
            ------------------------------\n`;

            console.log(metricsSummary);
            logStream.write(metricsSummary);
        }

        const totalUsersMatch = benchmarkOutput.match(/Total users:\s*(\d+)/i);
        const successfulMatch = benchmarkOutput.match(/(?:Succes|Success)ful requests \(200 OK\):\s*(\d+)/i);
        const failedMatch = benchmarkOutput.match(/(?:failed request|Failed requests):\s*(\d+)/i);
        const totalTimeMatch = benchmarkOutput.match(/Total time:\s*(\d+)\s*ms/i);
        const avgLatencyMatch = benchmarkOutput.match(/RTT average latency:\s*([\d.]+)\s*ms/i);
        const throughputMatch = benchmarkOutput.match(/Throughput estimated:\s*([\d.]+)\s*req\/sec/i);

        const totalUsers = totalUsersMatch ? totalUsersMatch[1] : 300;
        const successful = successfulMatch ? successfulMatch[1] : 0;
        const failed = failedMatch ? failedMatch[1] : 0;
        const totalTime = totalTimeMatch ? totalTimeMatch[1] : 0;
        const avgLatency = avgLatencyMatch ? avgLatencyMatch[1] : 0;
        const throughput = throughputMatch ? throughputMatch[1] : 0;

        const timestamp = new Date().toISOString();
        const csvRow = `${timestamp},${totalUsers},${successful},${failed},${totalTime},${avgLatency},${throughput},${maxRamMB},${avgCpu},${maxCpu}\n`;
        fs.appendFileSync(csvPath, csvRow, 'utf8');

        console.log(`Stats saved in: ${csvPath}`);
        console.log('[5/5] All steps completed successfully!');
    } catch (error) {
        console.error(`\n Step failed: ${error.message}`);
        logStream.write(`\n ERROR: ${error.message}\n`);
        process.exitCode = 1;
    } finally {
        if (server && server.pid) {
            console.log('Stopping server and releasing ports...');
            if (process.platform === 'win32') {
                try {
                    execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: 'ignore' });
                } catch (e) {
                }
            } else {
                server.kill('SIGINT');
            }
        }
        logStream.end();
        process.exit(process.exitCode || 0);
    }
}

run();