type EchoMessage = { readonly payload: ArrayBuffer; readonly transfer: boolean };

addEventListener('message', (event: MessageEvent<{ readonly port: MessagePort }>) => {
  const port = event.data.port;
  port.onmessage = (inner: MessageEvent<EchoMessage>) => {
    const { payload, transfer } = inner.data;
    port.postMessage({ payload, transfer }, transfer ? [payload] : []);
  };
});
