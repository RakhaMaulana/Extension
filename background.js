let latestScanResult = null;

function log(message) {
  console.log(`[HTTP Observatory] ${message}`);
}

function fetchScanResults(url) {
  fetch(`https://http-observatory.security.mozilla.org/api/v1/analyze?host=${url.hostname}`, {
    method: 'GET',
  })
    .then(response => response.json())
    .then(data => {
      data.scannedUrl = url.href;
      latestScanResult = data;
      chrome.storage.local.set({ latestScanResult: latestScanResult });
      log(`Scan results retrieved for: ${url.hostname}`);

      if (data.state && data.state !== 'FINISHED') {
        log(`Scan for ${url.hostname} is in ${data.state} state. Checking results in 30 seconds.`);
        setTimeout(() => fetchScanResults(url), 30000); // Check results after 30 seconds
      } else {
        checkScanResults(data);
      }
    })
    .catch(error => {
      console.error('Error fetching scan results:', error);
      latestScanResult = { error: 'Failed to retrieve scan results.', scannedUrl: url.href };
      chrome.storage.local.set({ latestScanResult: latestScanResult });
    });
}

function performScan(url) {
  fetch(`https://http-observatory.security.mozilla.org/api/v1/analyze?host=${url.hostname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'hidden=true&rescan=true',
  })
    .then(response => response.json())
    .then(data => {
      data.scannedUrl = url.href;
      latestScanResult = data;
      chrome.storage.local.set({ latestScanResult: latestScanResult });

      if (data.error && data.error === 'rescan-attempt-too-soon') {
        log(`${url.hostname} is on temporary cooldown. Retrying scan in 30 seconds.`);
        setTimeout(() => performScan(url), 30000); // Retry scan after 30 seconds
      } else if (data.state && data.state !== 'FINISHED') {
        log(`Scan for ${url.hostname} is in ${data.state} state. Checking results in 30 seconds.`);
        setTimeout(() => fetchScanResults(url), 30000); // Check results after 30 seconds
      } else {
        log(`Scan completed for: ${url.hostname}`);
        checkScanResults(data);
      }
    })
    .catch(error => {
      console.error('Error initiating scan:', error);
      latestScanResult = { error: 'Failed to analyze the website.', scannedUrl: url.href };
      chrome.storage.local.set({ latestScanResult: latestScanResult });
    });
}

function checkScanResults(data) {
  const { grade, score } = data;
  log(`Checking scan results: Score = ${score}, Grade = ${grade}`);
  if (score < 50 || grade === 'F') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        log(`Low score detected, injecting script into tab: ${tabs[0].id}`);
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: showWarningPopup,
          args: [data]
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error('Script injection failed: ' + chrome.runtime.lastError.message);
          } else {
            log('Script injection succeeded.');
            console.log('Injection results:', results);
          }
        });
      }
    });
  }
}

function showWarningPopup(data) {
  console.log('showWarningPopup called with data:', data);
  const userResponse = confirm(`The website you are visiting has a low security score (${data.score}) and grade (${data.grade}). Do you still want to proceed?`);
  if (!userResponse) {
    window.location.href = 'about:blank';
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId === 0) { // Only scan the main frame
      const url = new URL(details.url);
      performScan(url);
    }
  }, { url: [{ schemes: ['http', 'https'] }] });
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) { // Only scan the main frame
    const url = new URL(details.url);
    performScan(url);
  }
}, { url: [{ schemes: ['http', 'https'] }] });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeWebsite') {
    const url = new URL(message.host.startsWith('http') ? message.host : `https://${message.host}`);
    performScan(url);
    sendResponse({ status: 'Scan initiated' });
    return true; // Indicates that sendResponse will be called asynchronously
  } else if (message.action === 'getLatestScan') {
    chrome.storage.local.get('latestScanResult', (result) => {
      sendResponse(result.latestScanResult);
    });
    return true; // Indicates that sendResponse will be called asynchronously
  }
});
