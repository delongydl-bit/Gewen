async function run() {
  const pages = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = pages.find(entry => entry.type === 'page');
  if (!page) throw new Error('No renderer page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const diagnostics = [];
  const requests = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') requests.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.loadingFailed') diagnostics.push(`${message.params.errorText}: ${requests.get(message.params.requestId) || message.params.requestId}`);
    if (message.method === 'Runtime.exceptionThrown') diagnostics.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
    if (message.method === 'Log.entryAdded') diagnostics.push(message.params.entry?.text);
  };
  socket.send(JSON.stringify({ id: 10, method: 'Runtime.enable' }));
  socket.send(JSON.stringify({ id: 11, method: 'Log.enable' }));
  socket.send(JSON.stringify({ id: 13, method: 'Network.enable' }));
  socket.send(JSON.stringify({ id: 12, method: 'Page.reload' }));
  await new Promise(resolve => setTimeout(resolve, 4000));
  const expression = `JSON.stringify({
    title: document.title,
    loadingHidden: document.getElementById('loading').hidden,
    loadingText: document.getElementById('loading').textContent,
    canvasWidth: document.getElementById('stage').width,
    buttons: document.querySelectorAll('.action-panel button').length
  })`;
  const value = await new Promise((resolve, reject) => {
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id === 1) resolve(message.result.result.value);
    };
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    setTimeout(() => reject(new Error('CDP timeout')), 5000);
  });
  socket.close();
  console.log(value);
  if (diagnostics.length) console.log('DIAGNOSTICS', diagnostics);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
