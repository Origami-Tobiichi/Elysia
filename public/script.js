const attackBtn = document.getElementById('attackBtn');
const resultCard = document.getElementById('resultCard');
const loadingDiv = document.getElementById('loading');

attackBtn.addEventListener('click', async () => {
  const url = document.getElementById('url').value;
  const connections = document.getElementById('connections').value;
  const duration = document.getElementById('duration').value;
  const pipelining = document.getElementById('pipelining').value;
  const workers = document.getElementById('workers').value;

  if (!url) {
    alert('❌ Masukkan target URL!');
    return;
  }

  attackBtn.disabled = true;
  loadingDiv.style.display = 'block';
  resultCard.style.display = 'none';

  try {
    const response = await fetch('/api/attack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, connections, duration, pipelining, workers })
    });
    const data = await response.json();
    if (data.error) {
      alert('⚠️ Error: ' + data.error);
    } else if (data.success) {
      displayResults(data.stats);
    } else {
      alert('Unknown response');
    }
  } catch (err) {
    alert('❌ Request gagal: ' + err.message);
  } finally {
    attackBtn.disabled = false;
    loadingDiv.style.display = 'none';
  }
});

function displayResults(stats) {
  document.getElementById('totalRequests').innerText = stats.requests.toLocaleString();
  document.getElementById('avgRps').innerText = Math.round(stats.avgRps);
  document.getElementById('avgLatency').innerText = Math.round(stats.avgLatency) + ' ms';
  document.getElementById('maxLatency').innerText = Math.round(stats.maxLatency) + ' ms';
  document.getElementById('p99Latency').innerText = Math.round(stats.p99) + ' ms';
  document.getElementById('errors').innerText = stats.errors;
  const throughputMB = (stats.throughput / 1024 / 1024).toFixed(2);
  document.getElementById('throughput').innerText = throughputMB + ' MB/s';
  resultCard.style.display = 'block';
}
