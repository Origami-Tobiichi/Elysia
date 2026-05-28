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
const customHeaders = document.getElementById('customHeaders');
const cookies = document.getElementById('cookies');
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
const activeUsersSpan = document.getElementById('activeUsers');

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

// Amplification toggle
let amplificationEnabled = false;
let amplificationKB = 500;
let amplificationTypeSel = 'normal';

amplifyToggle.addEventListener('change', () => {
    amplificationEnabled = amplifyToggle.checked;
    amplifyControls.style.display = amplificationEnabled ? 'block' : 'none';
});
amplifyKb.addEventListener('input', () => {
    amplificationKB = parseFloat(amplifyKb.value);
    amplifyValue.innerText = amplificationKB + ' KB';
});
amplifyType.addEventListener('change', () => { amplificationTypeSel = amplifyType.value; });

// ======================== Helper Functions ========================
function addLog(msg, isError = false) {
    const div = document.createElement('div');
    div.className = `border-l-2 pl-2 mb-1 ${isError ? 'border-red-500 text-red-300' : 'border-green-500 text-green-300'}`;
    div.innerHTML = `${isError ? '❌' : '✅'} ${msg}`;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
    if (logArea.children.length > 200) logArea.removeChild(logArea.firstChild);
}

function addTableStat(title, data) {
    const div = document.createElement('div');
    div.className = 'border border-gray-700 rounded p-2 mb-2 font-mono text-xs bg-black/40';
    div.innerHTML = `<div class="font-bold text-yellow-400 mb-1">${title}</div>${data}`;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
    if (logArea.children.length > 200) logArea.removeChild(logArea.firstChild);
}

function formatAutocannonResult(result) {
    if (!result || !result.latency) return '';
    let html = '';
    // Tabel latency
    html += `<table class="w-full text-left text-gray-300 border-collapse">`;
    html += `<tr class="border-b border-gray-700"><th class="pr-2">Stat</th><th class="pr-2">2.5%</th><th class="pr-2">50%</th><th class="pr-2">97.5%</th><th class="pr-2">99%</th><th>Avg</th><th>Stdev</th><th>Max</th></tr>`;
    const lat = result.latency;
    html += `<tr><td>Latency</td><td>${lat.p2_5 || 0} ms</td><td>${lat.p50 || 0} ms</td><td>${lat.p97_5 || 0} ms</td><td>${lat.p99 || 0} ms</td><td>${lat.average?.toFixed(2) || 0} ms</td><td>${lat.stddev?.toFixed(2) || 0} ms</td><td>${lat.max || 0} ms</td></tr>`;
    html += `</table><br>`;
    // Tabel request per second
    if (result.requests) {
        const req = result.requests;
        html += `<table class="w-full text-left text-gray-300 border-collapse">`;
        html += `<tr class="border-b border-gray-700"><th class="pr-2">Stat</th><th class="pr-2">1%</th><th class="pr-2">2.5%</th><th class="pr-2">50%</th><th class="pr-2">97.5%</th><th>Avg</th><th>Stdev</th><th>Min</th></tr>`;
        html += `<tr><td>Req/Sec</td><td>${req.p1 || 0}</td><td>${req.p2_5 || 0}</td><td>${req.p50 || 0}</td><td>${req.p97_5 || 0}</td><td>${req.average?.toFixed(2) || 0}</td><td>${req.stddev?.toFixed(2) || 0}</td><td>${req.min || 0}</td></tr>`;
        html += `</table><br>`;
    }
    if (result.throughput) {
        html += `<div>📊 Total: ${result.requests?.total || 0} requests in ${(result.duration || 0).toFixed(2)}s, ${(result.throughput?.total || 0) / 1e6} MB read</div>`;
    }
    if (result.errors) {
        html += `<div>⚠️ Errors: ${result.errors} (timeouts: ${result.timeouts || 0})</div>`;
    }
    return html;
}

function formatBatchResult(data) {
    if (!data) return '';
    return `<div>✅ Total requests: ${data.totalRequests}<br>✅ Success: ${data.successCount}<br>❌ Fail: ${data.failCount}<br>⏱️ Total time: ${(data.totalTimeMs / 1000).toFixed(2)}s<br>📈 RPS: ${data.rps}<br>📊 Avg latency: ${data.avgLatencyMs.toFixed(2)} ms</div>`;
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

function parseHeaders() {
    try { return JSON.parse(customHeaders.value); } catch(e) { return {}; }
}
function parseCookies() {
    const obj = {};
    cookies.value.split(';').forEach(c => { let [k,v]=c.trim().split('='); if(k) obj[k]=v||''; });
    return obj;
}

// ======================== Attack Functions ========================
async function runSingleAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    const atkType = attackType.value;
    let total = parseInt(totalInput.value);
    let concurrency = parseInt(concurrencyInput.value);
    let timeout = parseInt(timeoutInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = (atkType === 'slowloris');
    const multiplier = dualConnection.checked ? 2 : 1;
    const actualTotal = Math.min(total * multiplier, 5000);
    const actualConcurrency = Math.min(concurrency * multiplier, 100);
    const actualTimeout = Math.min(timeout, 9000);
    
    addLog(`💀 SINGLE ATTACK | ${mtd} ${url} | Concurrency:${actualConcurrency} | Total:${actualTotal}`);
    resetStats();
    stats.total = actualTotal;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    
    let completed = 0;
    const workers = [];
    const runOne = async () => {
        const headers = parseHeaders();
        const cookieObj = parseCookies();
        const cookieStr = Object.entries(cookieObj).map(([k,v])=>`${k}=${v}`).join('; ');
        if (cookieStr) headers["Cookie"] = cookieStr;
        
        const res = await fetch('/api/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: mtd, headers, body: "",
                timeout: actualTimeout, retryCount: 0, randomDelay,
                keepAlive, attackType: atkType,
                amplifyKB: amplificationEnabled ? amplificationKB : 0,
                amplifyEnabled: amplificationEnabled,
                amplifyType: amplificationTypeSel
            }),
            signal: abortController.signal
        });
        const data = await res.json();
        completed++;
        if (forceSuccessCheck.checked) {
            stats.success = completed;
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
        rawResponsePreview.innerText = `HTTP ${data.statusCode || '?'} | ${data.durationMs}ms | ${data.responseBody?.substring(0, 100) || ''}`;
        updateUI();
    };
    for (let i = 0; i < actualTotal; i++) {
        workers.push(runOne());
    }
    try {
        await Promise.all(workers);
        const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
        addLog(`🔥 FINISHED | Success:${stats.success} Fail:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB`);
    } catch(e) {
        if (e.name !== 'AbortError') addLog(`Error: ${e.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
        updateUI();
    }
}

async function runBatchAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    const atkType = attackType.value;
    let total = parseInt(totalInput.value);
    let concurrency = parseInt(concurrencyInput.value);
    let timeout = parseInt(timeoutInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = (atkType === 'slowloris');
    const multiplier = dualConnection.checked ? 2 : 1;
    const actualTotal = Math.min(total * multiplier, 5000);
    const actualConcurrency = Math.min(concurrency * multiplier, 50);
    const actualTimeout = Math.min(timeout, 9000);
    
    addLog(`🔥 BATCH ATTACK | ${mtd} ${url} | Concurrency:${actualConcurrency} | Total:${actualTotal}`);
    resetStats();
    stats.total = actualTotal;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    
    const headers = parseHeaders();
    const cookieObj = parseCookies();
    const cookieStr = Object.entries(cookieObj).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieStr) headers["Cookie"] = cookieStr;
    
    try {
        const res = await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: mtd, headers, body: "",
                timeout: actualTimeout, retryCount: 0, randomDelay,
                keepAlive, attackType: atkType,
                amplifyKB: amplificationEnabled ? amplificationKB : 0,
                amplifyEnabled: amplificationEnabled,
                amplifyType: amplificationTypeSel,
                concurrency: actualConcurrency,
                total: actualTotal
            }),
            signal: abortController.signal
        });
        const data = await res.json();
        if (data.success) {
            // Tampilkan tabel hasil batch
            const batchHtml = formatBatchResult(data);
            addTableStat('📊 BATCH RESULT', batchHtml);
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
            rawResponsePreview.innerText = `Batch: ${data.successCount}/${data.totalRequests} success`;
        } else {
            addLog(`Batch error: ${data.error}`, true);
        }
    } catch(e) {
        if (e.name !== 'AbortError') addLog(`Error: ${e.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
        updateUI();
    }
}

async function runAutocannonAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    let total = Math.min(parseInt(totalInput.value), 5000);
    let concurrency = Math.min(parseInt(concurrencyInput.value), 100);
    let duration = Math.min(Math.floor(parseInt(timeoutInput.value) / 1000), 9);
    if (duration <= 0) duration = 5;
    
    addLog(`🚀 AUTOCANNON | ${mtd} ${url} | Connections:${concurrency} | Duration:${duration}s | Total:${total}`);
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    
    const headers = parseHeaders();
    const cookieObj = parseCookies();
    const cookieStr = Object.entries(cookieObj).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieStr) headers["Cookie"] = cookieStr;
    
    try {
        const res = await fetch('/api/autocannon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: mtd, headers, body: "",
                connections: concurrency,
                duration: duration,
                amount: total,
            }),
            signal: abortController.signal
        });
        const data = await res.json();
        if (data.success) {
            const result = data.result;
            // Tampilkan tabel statistik
            const tableHtml = formatAutocannonResult(result);
            addTableStat('📈 AUTOCANNON RESULT', tableHtml);
            // Update stats summary
            if (result.requests) {
                stats.total = result.requests.total || total;
                stats.success = result.requests.completed || 0;
                stats.fail = result.errors || 0;
                stats.totalBytes = result.throughput?.total || 0;
                stats.times = result.latency?.values || [];
                updateUI();
            }
            addLog(`✅ Autocannon finished: ${result.requests?.completed || 0}/${result.requests?.total || total} success`);
            rawResponsePreview.innerText = `Autocannon: ${result.requests?.completed || 0}/${result.requests?.total || total} success, RPS: ${result.requests?.average?.toFixed(2) || 0}`;
        } else {
            addLog(`❌ Autocannon failed: ${data.error}`, true);
        }
    } catch(e) {
        if (e.name !== 'AbortError') addLog(`Error: ${e.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
        updateUI();
    }
}

function stopAttack() {
    if (isRunning && abortController) {
        abortController.abort();
        addLog("⏹️ Attack stopped by user");
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

// ======================== Event Listeners ========================
startBtn.addEventListener('click', runSingleAttack);
batchBtn.addEventListener('click', runBatchAttack);
// Tambahkan event untuk tombol Autocannon (jika ada di HTML)
// Pastikan tombol dengan id "btnAutocannon" ada di HTML
const btnAutocannon = document.getElementById('btnAutocannon');
if (btnAutocannon) {
    btnAutocannon.addEventListener('click', runAutocannonAttack);
}
stopBtn.addEventListener('click', stopAttack);
exportBtn.addEventListener('click', exportCSV);

// ======================== Health & Preview ========================
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
refreshPreviewBtn.addEventListener('click', () => {
    let u = targetUrl.value.trim();
    if (u) {
        updatePreview(u);
        checkTargetHealth(u);
    }
});
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

// ======================== Initialization ========================
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
    amplifyToggle.dispatchEvent(new Event('change'));
    amplifyKb.dispatchEvent(new Event('input'));
};
