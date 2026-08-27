const fs = require('fs');

async function run() {
  const pages = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = pages.find(entry => entry.type === 'page');
  if (!page) throw new Error('No renderer page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const cycles = Math.max(0, Number(process.argv[2]) || 0);
  for (let index = 0; index < cycles; index += 1) {
    socket.send(JSON.stringify({ id: 100 + index, method: 'Runtime.evaluate', params: { expression: "document.getElementById('modelsButton').click()" } }));
    await new Promise(resolve => setTimeout(resolve, 1800));
  }
  if (process.argv[3] === 'interact' || process.argv[3] === 'greeting') {
    const actionIndex = process.argv[3] === 'greeting' ? 0 : 1;
    socket.send(JSON.stringify({ id: 200, method: 'Runtime.evaluate', params: { expression: `document.querySelectorAll('.action-panel button')[${actionIndex}].click()` } }));
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  const result = await new Promise((resolve, reject) => {
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id === 1) resolve(message.result.data);
    };
    socket.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png', fromSurface: true } }));
    setTimeout(() => reject(new Error('CDP timeout')), 5000);
  });
  socket.close();
  fs.writeFileSync('gewen-current.png', Buffer.from(result, 'base64'));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
