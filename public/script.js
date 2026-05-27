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
const refreshPreviewBtn = document.getElementById('refreshPreview');
const targetFrame = document.getElementById('targetFrame');
const healthText = document.getElementById('healthText');
const responseTimeText = document.getElementById('responseTimeText');
const successSpan = document.getElementById('successCount');
const failSpan = document.getElementById('failCount');
const avgSpan = document.getElementById('avgTime');
const rpsSpan = document.getElementById('rps');
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

// Helpers
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

async function sendRequest(type, body) {
    if (isRunning) { addLog("Attack already running! Stop first.", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    
    body.url = url;
    body.method = method.value;
    body.headers = parseHeaders();
    body.cookies = parseCookies();
    body.attackType = attackType.value;
    body.retryCount = 0;
    body.randomDelay = parseInt(randomDelayInput.value);
    body.keepAlive = attackType.value === 'slowloris';
    body.amplifyKB = amplifyToggle.checked ? 500 : 0;
    body.amplifyEnabled = amplifyToggle.checked;
    body.amplifyType = 'normal';
    body.timeout = Math.min(parseInt(timeoutInput.value), 9000);
    body.concurrency = Math.min(parseInt(concurrencyInput.value), 100);
    body.total = Math.min(parseInt(totalInput.value), 5000);
    
    addLog(`🚀 ${type.toUpperCase()} | ${method.value} ${url} | Concurrency:${body.concurrency} | Total:${body.total}`);
    resetStats();
    stats.total = body.total;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    
    const onUpdate = (result) => {
        if (result.success !== undefined) {
            if (forceSuccessCheck.checked || result.success) {
                stats.success++;
                stats.times.push(result.durationMs);
                stats.totalBytes += result.responseSize;
                updateChart(result.durationMs);
            } else {
                stats.fail++;
                addLog(`Failed: ${result.error} (${result.durationMs}ms)`, true);
            }
            updateUI();
        }
    };
    
    try {
        let finalBody = { ...body };
        if (type === 'attack') {
            // Single attack tidak menggunakan concurrency di backend, frontend yang handle paralel
            // Di sini kita kirim single request dan backend akan mengembalikan satu result
            const multiplier = dualConnection.checked ? 2 : 1;
            const actualTotal = body.total * multiplier;
            let completed = 0;
            const workers = [];
            const runOne = async () => {
                const res = await fetch('/api/attack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(finalBody),
                    signal: abortController.signal
                });
                const data = await res.json();
                onUpdate(data);
                completed++;
                rawResponsePreview.innerText = `HTTP ${data.statusCode || '?'} | ${data.durationMs}ms | ${data.responseBody?.substring(0, 100) || ''}`;
                if (forceSuccessCheck.checked) {
                    stats.success = completed;
                    updateUI();
                }
            };
            for (let i = 0; i < actualTotal; i++) {
                workers.push(runOne());
            }
            await Promise.all(workers);
            addLog(`✅ FINISHED | Success:${stats.success} Fail:${stats.fail} | Data: ${(stats.totalBytes/1024).toFixed(1)}KB`);
        } else {
            // Batch attack: backend yang mengelola concurrency
            finalBody.concurrency = body.concurrency;
            finalBody.total = body.total;
            const res = await fetch('/api/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalBody),
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
                rawResponsePreview.innerText = `Batch: ${data.successCount}/${data.totalRequests} success`;
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
        stopBtn.disabled = true;
        abortController = null;
        updateUI();
    }
}

startBtn.onclick = () => sendRequest('attack', {});
batchBtn.onclick = () => sendRequest('batch', {});
stopBtn.onclick = () => {
    if (abortController) {
        abortController.abort();
        addLog("⏹️ Attack stopped");
        stopBtn.disabled = true;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        isRunning = false;
    } else {
        addLog("No attack running", true);
    }
};

exportBtn.onclick = () => {
    if (stats.times.length === 0 && stats.success + stats.fail === 0) { addLog("No data", true); return; }
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

// Health check
async function checkHealth() {
    try {
        const start = performance.now();
        await fetch(targetUrl.value.trim(), { method: 'HEAD', mode: 'no-cors' });
        const duration = performance.now() - start;
        responseTimeText.innerText = `⚡ ${duration.toFixed(0)}ms`;
        healthText.innerText = 'Online';
    } catch(e) { healthText.innerText = 'Offline'; }
}
refreshPreviewBtn.onclick = () => {
    let u = targetUrl.value.trim();
    if (!u.startsWith('http')) u = 'https://' + u;
    targetFrame.srcdoc = `<html><body style="background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100%"><a href="${u}" target="_blank">Open</a></body></html>`;
    checkHealth();
};
setInterval(() => { if (targetUrl.value.trim()) checkHealth(); }, 10000);

window.onload = () => {
    const ctx = rtChartCanvas.getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] },
        options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } }
    });
    fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`));
};
