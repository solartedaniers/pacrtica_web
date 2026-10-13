import { SharedMemoryViews } from '../core/memory/shared-memory-layout';
import { RingHistoryReader } from '../core/memory/ring-history';
import { ExportCommand, ExportReply } from '../core/protocol/control-messages';
import { ExportJobRunner } from '../core/export/export-job-runner';

type ExportWorkerMessage = { readonly type: 'init'; readonly memory: SharedArrayBuffer } | ExportCommand;

let runner: ExportJobRunner | null = null;

addEventListener('message', (event: MessageEvent<ExportWorkerMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    const reader = new RingHistoryReader(new SharedMemoryViews(message.memory));
    runner = new ExportJobRunner(reader, (reply: ExportReply, transfer?: Transferable[]) => postMessage(reply, transfer ?? []));
    return;
  }
  runner?.run(message);
});
