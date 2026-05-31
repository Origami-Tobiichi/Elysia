// ======================== DOM Elements ========================
const targetUrl = document.getElementById('targetUrl');
const method = document.getElementById('method');
const attackType = document.getElementById('attackType');
const concurrencyInput = document.getElementById('concurrency');
const totalInput = document.getElementById('total');
const timeoutInput = document.getElementById('timeout');
const randomDelayInput = document.getElementById('randomDelay');
const amplifyToggle = document.getElementById('amplifyToggle');
const amplifyControls = document.getElementById('amplifyControls');
const amplifyKb = document.getElementById('amplifyKb');
const amplifyValue = document.getElementById('amplifyValue');
const amplifyType = document.getElementById('amplifyType');
const dualConnection = document.getElementById('dualConnection');
const forceSuccessCheck = document.getElementById('forceSuccess');
const unlimitedMode = document.getElementById('unlimitedMode');
const intervalMsInput = document.getElementById('intervalMs');
const customHeaders = document.getElementById('customHeaders');
const cookies = document.getElementById('cookies');
const startBtn = document.getElementById('startBtn');
const batchBtn = document.getElementById('batchBtn');
const stopBtn = document.getElementById('stopBtn');
const autocannonBtn = document.getElementById('autocannonBtn');
const browserlessBtn = document.getElementById('browserlessBtn');
const exportBtn = document.getElementById('exportBtn');
const refreshPreviewBtn = document.getElementById('refreshPreview');
const targetFrame = document.getElementById('targetFrame');
const healthIndicator = document.getElementById('healthIndicator');
const healthText = document.getElementById('healthText');
const responseTimeText = document.getElementById('responseTimeText');
const successSpan = document.getElementById('successCount');
const failSpan = document.getElementById('failCount');
const avgSpan = document.getElementById('avgTime');
const rpsSpan = document.getElementById('rps');
const errorRateSpan = document.getElementById('errorRate');
const totalBytesSpan = document.getElementById('totalBytes');
const trafficMbpsSpan = document.getElementById('trafficMbps');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const logArea = document.getElementById('logArea');
const rtChartCanvas = document.getElementById('rtChart');
const rawResponsePreview = document.getElementById('rawResponsePreview');
const activeUsersSpan = document.getElementById('activeUsers');
const autocannonPanel = document.getElementById('autocannonPanel');
const autocannonResult = document.getElementById('autocannonResult');
const closeAutocannonPanel = document.getElementById('closeAutocannonPanel');

// State
let chart;
let abortController = null;
let isRunning = false;
let stats = {
    success: 0, fail: 0, times: [], totalBytes: 0,
    startTime: 0, total: 0
};
let lastChartUpdate = 0;
let lastTrafficUpdate = 0, lastTotalBytes = 0;
let healthCheckInterval = null, heartbeatInterval = null;
let amplificationEnabled = false, amplificationKB = 500, amplificationTypeSel = 'normal';

// Amplification listeners
if (amplifyToggle) {
    amplifyToggle.onchange = () => {
        amplificationEnabled = amplifyToggle.checked;
        if (amplifyControls) amplifyControls.style.display = amplificationEnabled ? 'block' : 'none';
    };
}
if (amplifyKb) {
    amplifyKb.oninput = () => {
        amplificationKB = parseFloat(amplifyKb.value);
        if (amplifyValue) amplifyValue.innerText = amplificationKB + ' KB';
    };
}
if (amplifyType) {
    amplifyType.onchange = () => { amplificationTypeSel = amplifyType.value; };
}

// Helper functions
function addLog(msg, isError = false) {
    const div = document.createElement('div');
    div.className = `border-l-2 pl-2 mb-1 ${isError ? 'border-red-500 text-red-300' : 'border-green-500 text-green-300'}`;
    div.innerHTML = `${isError ? '❌' : '✅'} ${msg}`;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
    if (logArea.children.length > 100) logArea.removeChild(logArea.firstChild);
}

function updateUI() {
    successSpan.innerText = stats.success;
    failSpan.innerText = stats.fail;
    const done = stats.success + stats.fail;
    const errorRate = done === 0 ? 0 : (stats.fail / done * 100).toFixed(1);
    errorRateSpan.innerText = errorRate + '%';
    totalBytesSpan.innerText = (stats.totalBytes / 1024).toFixed(1);
    if (stats.times.length) {
        const avg = stats.times.reduce((a,b)=>a+b,0)/stats.times.length;
        avgSpan.innerText = avg.toFixed(1);
    } else avgSpan.innerText = "0";
    if (stats.startTime && isRunning) {
        const elapsed = (Date.now() - stats.startTime) / 1000;
        if (elapsed > 0) rpsSpan.innerText = (done / elapsed).toFixed(1);
    } else if (stats.startTime) {
        const elapsed = (Date.now() - stats.startTime) / 1000;
        if (elapsed > 0) rpsSpan.innerText = (stats.times.length / elapsed).toFixed(1);
    }
    const percent = stats.total ? (done / stats.total) * 100 : 0;
    progressBar.style.width = `${percent}%`;
    progressText.innerText = `${done}/${stats.total === 0 ? '∞' : stats.total}`;
    updateTrafficEstimator();
}

function updateChart(ms) {
    if (!chart) return;
    const now = Date.now();
    if (now - lastChartUpdate > 150 || chart.data.datasets[0].data.length % 3 === 0) {
        chart.data.datasets[0].data.push(ms);
        if (chart.data.datasets[0].data.length > 60) chart.data.datasets[0].data.shift();
        chart.update('none');
        lastChartUpdate = now;
    }
}

function resetStats() {
    stats = { success:0, fail:0, times:[], totalBytes:0, startTime:0, total:0 };
    if (chart) { chart.data.datasets[0].data = []; chart.update(); }
    lastTrafficUpdate = 0;
    lastTotalBytes = 0;
    updateUI();
}

function updateTrafficEstimator() {
    const now = Date.now();
    if (lastTrafficUpdate !== 0 && now - lastTrafficUpdate >= 1000) {
        const deltaBytes = stats.totalBytes - lastTotalBytes;
        const mbps = (deltaBytes * 8) / 1e6;
        trafficMbpsSpan.innerText = mbps.toFixed(2);
        lastTotalBytes = stats.totalBytes;
        lastTrafficUpdate = now;
    } else if (lastTrafficUpdate === 0) {
        lastTrafficUpdate = now;
        lastTotalBytes = stats.totalBytes;
    }
}
setInterval(updateTrafficEstimator, 1000);

function parseHeaders() { try { return JSON.parse(customHeaders.value); } catch(e){ return {}; } }
function parseCookies() {
    const obj = {};
    cookies.value.split(';').forEach(c => { let [k,v]=c.trim().split('='); if(k) obj[k]=v||''; });
    return obj;
}

function displayAutocannonResult(result) {
    autocannonPanel.style.display = 'block';
    let html = `<table class="result-table">`;
    if (result.latency) {
        html += `<tr><th colspan="2">Latency (ms)</th></tr>
                <tr><td>2.5%</td><td>${result.latency.p2_5 || '-'}</td></tr>
                <tr><td>50% (Median)</td><td>${result.latency.p50 || '-'}</td></tr>
                <tr><td>97.5%</td><td>${result.latency.p97_5 || '-'}</td></tr>
                <tr><td>99%<\/td><td>${result.latency.p99 || '-'}<\/td><\/tr>
                <tr><td>Average<\/td><td>${result.latency.average || '-'}<\/td><\/tr>
                <tr><td>Max<\/td><td>${result.latency.max || '-'}<\/td><\/tr>`;
    }
    if (result.requests) {
        html += `<tr><th colspan="2">Requests / Sec</th></tr>
                <tr><td>Average<\/td><td>${result.requests.average || '-'}<\/td><\/tr>
                <tr><td>Min<\/td><td>${result.requests.min || '-'}<\/td><\/tr>
                <tr><td>Max<\/td><td>${result.requests.max || '-'}<\/td><\/tr>`;
    }
    html += `<tr><th colspan="2">Overall</th></tr>
            <tr><td>Total Requests<\/td><td>${result.requests?.total || '-'}<\/td><\/tr>
            <tr><td>Duration (s)<\/td><td>${result.duration?.toFixed(2) || '-'}<\/td><\/tr>
            <tr><td>Bytes Read<\/td><td>${((result.bytesRead || 0) / (1024*1024)).toFixed(2)} MB<\/td><\/tr>
            </table>`;
    autocannonResult.innerHTML = html;
}
if (closeAutocannonPanel) {
    closeAutocannonPanel.onclick = () => { autocannonPanel.style.display = 'none'; };
}

// ==================== SINGLE ATTACK (dengan semua parameter) ====================
async function runSingleAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    const atk = attackType.value;
    let total = parseInt(totalInput.value);
    let concurrency = parseInt(concurrencyInput.value);
    let timeout = parseInt(timeoutInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = (atk === 'slowloris');
    const multiplier = dualConnection.checked ? 2 : 1;
    const infinite = unlimitedMode.checked;
    const actualConcurrency = Math.min(concurrency * multiplier, 5000);
    const actualTimeout = Math.min(timeout, 9000);
    
    if (!infinite && (isNaN(total) || total <= 0)) { addLog("Total must be >0 or enable Unlimited Mode", true); return; }
    if (infinite) {
        stats.total = 0;
        addLog(`♾️ UNLIMITED SINGLE ATTACK | ${mtd} ${url} | Concurrency:${actualConcurrency} | Loop infinite until STOP`);
    } else {
        stats.total = total * multiplier;
        addLog(`💀 SINGLE ATTACK | ${mtd} ${url} | Concurrency:${actualConcurrency} | Total:${stats.total} | Timeout:${actualTimeout}ms | RandomDelay:${randomDelay}ms`);
    }
    resetStats();
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    autocannonBtn.disabled = true;
    if (browserlessBtn) browserlessBtn.disabled = true;
    stopBtn.disabled = false;
    
    const sendOne = async () => {
        const headers = parseHeaders();
        const cookieObj = parseCookies();
        const cookieStr = Object.entries(cookieObj).map(([k,v])=>`${k}=${v}`).join('; ');
        if (cookieStr) headers["Cookie"] = cookieStr;
        try {
            const res = await fetch('/api/attack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url, method: mtd, headers, body: "",
                    timeout: actualTimeout, retryCount: 0, randomDelay,
                    keepAlive, attackType: atk,
                    amplifyKB: amplificationEnabled ? amplificationKB : 0,
                    amplifyEnabled: amplificationEnabled,
                    amplifyType: amplificationTypeSel
                }),
                signal: abortController.signal
            });
            const data = await res.json();
            if (forceSuccessCheck.checked) {
                stats.success++;
                stats.totalBytes += (data.responseSize || 0) + (amplificationEnabled ? amplificationKB*1024 : 0);
                stats.times.push(data.durationMs);
                updateChart(data.durationMs);
            } else {
                if (data.success) {
                    stats.success++;
                    stats.times.push(data.durationMs);
                    stats.totalBytes += data.responseSize;
                    updateChart(data.durationMs);
                } else {
                    stats.fail++;
                    addLog(`Failed: ${data.error} (${data.durationMs}ms)`, true);
                }
            }
            rawResponsePreview.innerText = `HTTP ${data.statusCode || '?'} | ${data.durationMs}ms | ${(data.responseBody || '').substring(0, 200)}`;
            updateUI();
        } catch (err) {
            if (err.name !== 'AbortError') {
                stats.fail++;
                addLog(`Request error: ${err.message}`, true);
                updateUI();
            }
        }
    };
    
    let running = true;
    const stopHandler = () => { running = false; };
    stopBtn.addEventListener('click', stopHandler, { once: true });
    
    if (infinite) {
        const workers = [];
        for (let i = 0; i < actualConcurrency; i++) {
            workers.push((async () => {
                while (running && !abortController.signal.aborted) {
                    await sendOne();
                    if (!running) break;
                }
            })());
        }
        await Promise.all(workers);
        const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
        addLog(`⏹️ UNLIMITED STOPPED | Success:${stats.success} Fail:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB`);
    } else {
        let completed = 0;
        const targetTotal = stats.total;
        const workers = [];
        for (let i = 0; i < actualConcurrency; i++) {
            workers.push((async () => {
                while (completed < targetTotal && !abortController.signal.aborted) {
                    await sendOne();
                    completed++;
                    if (completed >= targetTotal) break;
                }
            })());
        }
        await Promise.all(workers);
        const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
        addLog(`🔥 FINISHED | Success:${stats.success} Fail:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB`);
    }
    
    isRunning = false;
    startBtn.disabled = false;
    batchBtn.disabled = false;
    autocannonBtn.disabled = false;
    if (browserlessBtn) browserlessBtn.disabled = false;
    stopBtn.disabled = true;
    abortController = null;
    stopBtn.removeEventListener('click', stopHandler);
}

// ==================== BATCH ATTACK (dengan semua parameter) ====================
async function runBatchAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    const atk = attackType.value;
    let total = parseInt(totalInput.value);
    let concurrency = parseInt(concurrencyInput.value);
    let timeout = parseInt(timeoutInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = (atk === 'slowloris');
    const multiplier = dualConnection.checked ? 2 : 1;
    const infinite = unlimitedMode.checked;
    const actualTotal = infinite ? 5000 : Math.min(total * multiplier, 5000);
    const actualConcurrency = Math.min(concurrency * multiplier, 50);
    const actualTimeout = Math.min(timeout, 9000);
    
    if (!infinite && (isNaN(total) || total <= 0)) { addLog("Total must be >0 or enable Unlimited Mode", true); return; }
    if (infinite) addLog("♾️ UNLIMITED BATCH MODE: akan berulang setiap batch 5000 request hingga STOP");
    addLog(`🔥 BATCH ATTACK | ${mtd} ${url} | Concurrency:${actualConcurrency} | Batch:${actualTotal} | Timeout:${actualTimeout}ms | RandomDelay:${randomDelay}ms`);
    resetStats();
    stats.total = infinite ? 0 : actualTotal;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    autocannonBtn.disabled = true;
    if (browserlessBtn) browserlessBtn.disabled = true;
    stopBtn.disabled = false;
    
    const headers = parseHeaders();
    const cookieObj = parseCookies();
    const cookieStr = Object.entries(cookieObj).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieStr) headers["Cookie"] = cookieStr;
    
    const runOneBatch = async () => {
        const res = await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: mtd, headers, body: "",
                timeout: actualTimeout, retryCount: 0, randomDelay,
                keepAlive, attackType: atk,
                amplifyKB: amplificationEnabled ? amplificationKB : 0,
                amplifyEnabled: amplificationEnabled,
                amplifyType: amplificationTypeSel,
                concurrency: actualConcurrency,
                total: actualTotal
            }),
            signal: abortController.signal
        });
        return await res.json();
    };
    
    try {
        if (infinite) {
            while (!abortController.signal.aborted) {
                const data = await runOneBatch();
                if (data.success) {
                    if (forceSuccessCheck.checked) {
                        stats.success += data.totalRequests;
                        stats.totalBytes += data.totalBytes;
                    } else {
                        stats.success += data.successCount;
                        stats.fail += data.failCount;
                        stats.totalBytes += data.totalBytes;
                    }
                    stats.times.push(...data.latencies);
                    updateUI();
                    addLog(`Batch loop: +${data.successCount} success, +${data.failCount} fail`);
                } else {
                    addLog(`Batch error: ${data.error}`, true);
                }
            }
        } else {
            const data = await runOneBatch();
            if (data.success) {
                if (forceSuccessCheck.checked) {
                    stats.success = data.totalRequests;
                    stats.totalBytes = data.totalBytes;
                } else {
                    stats.success = data.successCount;
                    stats.fail = data.failCount;
                    stats.totalBytes = data.totalBytes;
                }
                stats.times = data.latencies || [];
                stats.total = data.totalRequests;
                updateUI();
                addLog(`✅ BATCH FINISHED | Success:${data.successCount} Fail:${data.failCount} | RPS:${data.rps} | Time:${(data.totalTimeMs/1000).toFixed(2)}s`);
            } else {
                addLog(`Batch error: ${data.error}`, true);
            }
        }
    } catch(e) {
        if (e.name !== 'AbortError') addLog(`Error: ${e.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        autocannonBtn.disabled = false;
        if (browserlessBtn) browserlessBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
    }
}

// ==================== AUTOCANNON ATTACK ====================
async function runAutocannonAttack() {
    if (isRunning) { addLog("Attack already running! Stop it first.", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    let connections = parseInt(concurrencyInput.value);
    let duration = Math.min(parseInt(timeoutInput.value) / 1000, 9);
    let amount = parseInt(totalInput.value);
    const infinite = unlimitedMode.checked;
    if (duration <= 0) duration = 5;
    connections = Math.min(connections, 100);
    if (!infinite && (isNaN(amount) || amount <= 0)) amount = 5000;
    amount = Math.min(amount, 5000);
    addLog(`🚀 AUTOCANNON | ${mtd} ${url} | Connections:${connections} | Duration:${duration}s | Total:${amount}`);
    resetStats();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    autocannonBtn.disabled = true;
    if (browserlessBtn) browserlessBtn.disabled = true;
    stopBtn.disabled = false;
    const headers = parseHeaders();
    try {
        const res = await fetch('/api/autocannon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: mtd, headers, body: "",
                connections, duration, amount
            }),
            signal: abortController.signal
        });
        const data = await res.json();
        if (data.success) {
            addLog(`✅ AUTOCANNON completed`);
            if (data.result) {
                displayAutocannonResult(data.result);
                stats.total = data.result.requests?.total || 0;
                stats.success = data.result.requests?.total || 0;
                stats.fail = data.result.errors || 0;
                stats.totalBytes = data.result.bytesRead || 0;
                if (data.result.latency && data.result.latency.average) {
                    stats.times = [data.result.latency.average];
                }
                updateUI();
            }
        } else {
            addLog(`❌ AUTOCANNON gagal: ${data.error}`, true);
        }
    } catch(e) {
        if (e.name !== 'AbortError') addLog(`Error: ${e.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        autocannonBtn.disabled = false;
        if (browserlessBtn) browserlessBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
        updateUI();
    }
}

// ==================== BROWSERLESS BOT (menampilkan Raw Response) ====================
async function runBrowserlessBot() {
    if (isRunning) { addLog("Another attack is running! Stop it first.", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const loop = unlimitedMode.checked;
    const interval = parseInt(intervalMsInput?.value) || 5000;
    
    addLog(`🤖 Memulai Browserless bot ke ${url} (loop: ${loop}, interval: ${interval}ms)`);
    isRunning = true;
    startBtn.disabled = true;
    batchBtn.disabled = true;
    autocannonBtn.disabled = true;
    if (browserlessBtn) browserlessBtn.disabled = true;
    stopBtn.disabled = false;
    
    const callBot = async () => {
        try {
            const res = await fetch('/api/bot/browserless', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, loop: false, intervalMs: interval })
            });
            const data = await res.json();
            if (data.success) {
                addLog(`✅ Browserless bot mengunjungi ${url} berhasil`);
                // Tampilkan raw response dari Browserless
                let raw = JSON.stringify(data.result, null, 2);
                if (raw.length > 500) raw = raw.substring(0, 500) + '...';
                rawResponsePreview.innerText = raw;
                return true;
            } else {
                addLog(`❌ Bot error: ${data.error}`, true);
                rawResponsePreview.innerText = `Error: ${data.error}`;
                return false;
            }
        } catch (err) {
            addLog(`❌ Bot request gagal: ${err.message}`, true);
            rawResponsePreview.innerText = `Request failed: ${err.message}`;
            return false;
        }
    };
    
    if (loop) {
        let shouldStop = false;
        const stopHandler = () => { shouldStop = true; };
        stopBtn.addEventListener('click', stopHandler, { once: true });
        while (!shouldStop && isRunning) {
            await callBot();
            await new Promise(r => setTimeout(r, interval));
        }
        stopBtn.removeEventListener('click', stopHandler);
        addLog("⏹️ Browserless bot dihentikan oleh user");
    } else {
        await callBot();
    }
    
    isRunning = false;
    startBtn.disabled = false;
    batchBtn.disabled = false;
    autocannonBtn.disabled = false;
    if (browserlessBtn) browserlessBtn.disabled = false;
    stopBtn.disabled = true;
}

function stopAttack() {
    if (isRunning && abortController) {
        abortController.abort();
        addLog("⏹️ Attack stopped by user");
        stopBtn.disabled = true;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        autocannonBtn.disabled = false;
        if (browserlessBtn) browserlessBtn.disabled = false;
        isRunning = false;
    } else {
        addLog("No attack running", true);
    }
}

function exportCSV() {
    if (stats.times.length === 0 && stats.success + stats.fail === 0) { addLog("No data to export", true); return; }
    let csv = "ResponseTime(ms),Success,Failed\n";
    stats.times.forEach(t => csv += `${t},1,0\n`);
    for (let i=0; i<stats.fail; i++) csv += "0,0,1\n";
    const blob = new Blob([csv], {type:"text/csv"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stresser_${Date.now()}.csv`;
    link.click();
    addLog("CSV exported");
}

// ======================== Health Check & Active Users ========================
async function checkTargetHealth(url) {
    try {
        const start = performance.now();
        await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache' });
        const duration = performance.now() - start;
        responseTimeText.innerText = `⚡ ${duration.toFixed(0)} ms`;
        healthIndicator.className = 'health-online w-3 h-3 rounded-full';
        healthText.innerText = 'Online';
    } catch(e) {
        healthIndicator.className = 'health-offline w-3 h-3 rounded-full';
        healthText.innerText = 'Offline';
        responseTimeText.innerText = '';
    }
}
function updatePreview(url) {
    let pu = url; if (!pu.startsWith('http')) pu = 'https://' + pu;
    targetFrame.srcdoc = `<html><body style="background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100%"><a href="${pu}" target="_blank">Open in new tab</a></body></html>`;
}
if (refreshPreviewBtn) {
    refreshPreviewBtn.onclick = () => {
        let u = targetUrl.value.trim();
        if (u) {
            updatePreview(u);
            checkTargetHealth(u);
        }
    };
}
function startHealthCheck() {
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(() => {
        let u = targetUrl.value.trim();
        if (u) checkTargetHealth(u);
    }, 5000);
}
async function updateActiveUsers() {
    try {
        const res = await fetch('/api/heartbeat');
        const data = await res.json();
        activeUsersSpan.innerText = data.active;
    } catch(e) {}
}
function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(updateActiveUsers, 30000);
    updateActiveUsers();
}

// ======================== Event Listeners ========================
if (startBtn) startBtn.onclick = runSingleAttack;
if (batchBtn) batchBtn.onclick = runBatchAttack;
if (autocannonBtn) autocannonBtn.onclick = runAutocannonAttack;
if (browserlessBtn) browserlessBtn.onclick = runBrowserlessBot;
if (stopBtn) stopBtn.onclick = stopAttack;
if (exportBtn) exportBtn.onclick = exportCSV;

// ======================== Initialization ========================
window.onload = () => {
    if (rtChartCanvas) {
        const ctx = rtChartCanvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] },
            options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } }
        });
    }
    fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`)).catch(()=>addLog("Backend OK"));
    let u = targetUrl.value.trim();
    if (u) updatePreview(u);
    startHealthCheck();
    startHeartbeat();
    if (amplifyToggle) amplifyToggle.dispatchEvent(new Event('change'));
    if (amplifyKb) amplifyKb.dispatchEvent(new Event('input'));
};
