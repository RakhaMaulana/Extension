document.getElementById('scanButton').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab) {
      chrome.runtime.sendMessage({ action: 'analyzeWebsite', host: activeTab.url }, (response) => {
        console.log(response);
      });
    }
  });
});

chrome.runtime.sendMessage({ action: 'getLatestScan' }, (latestScanResult) => {
  const resultDiv = document.getElementById('result');
  if (latestScanResult) {
    resultDiv.innerHTML = `
      <h2>Latest Scan Result</h2>
      <p>URL: ${latestScanResult.scannedUrl}</p>
      <p>Score: ${latestScanResult.score}</p>
      <p>Grade: ${latestScanResult.grade}</p>
    `;
  } else {
    resultDiv.innerHTML = '<p>No scan results available.</p>';
  }
});
