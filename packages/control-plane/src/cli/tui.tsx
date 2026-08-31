import React, { useState } from 'react';
import { Box, Text, render, useInput } from 'ink';
import type { ActivationOperation } from '../domain/activation-operation';
import type { ConfigurationRevision } from '../domain/configuration';
import { agentId } from '../domain/agent';
import type { CliOverrides, FullDeps } from './index';
import { openDeps } from './index';
import { listConfigRevisions } from '../application/queries';
import { prepareActivation, confirmActivation, executeActivation, rejectActivation, type ActivationStatus } from '../application/activation';
import { renderDetail, renderConfirmationSummary, renderFailure, renderHandoffLine, renderStatus, renderQueryFailure } from './render';

export interface TuiAppProps {
  readonly revisions: readonly ConfigurationRevision[];
  readonly onConfirm: (revision: ConfigurationRevision, operation?: ActivationOperation) => void;
  readonly onCancel: () => void;
  readonly onPrepare?: (revision: ConfigurationRevision) => Promise<ActivationOperation>;
  readonly onReject?: (operation: ActivationOperation) => Promise<void>;
}
type TuiScreen = 'list' | 'detail' | 'confirm';

export function TuiApp({ revisions, onConfirm, onCancel, onPrepare, onReject }: TuiAppProps): React.JSX.Element {
  const [screen, setScreen] = useState<TuiScreen>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [operation, setOperation] = useState<ActivationOperation>();
  const selected = revisions[selectedIndex];
  const operationPreview = operation ?? { operationId: 'pending', revisionId: selected?.revisionId ?? null, configName: selected?.configName ?? 'pending' as ConfigurationRevision['configName'], agentId: agentId('omp'), phase: 'awaiting-confirmation', version: 0, planHash: 'pending', createdAt: '', updatedAt: '', terminalReason: undefined } as const;
  useInput((input, key) => {
    if (screen === 'list') {
      if (key.upArrow) setSelectedIndex((index) => Math.max(0, index - 1));
      else if (key.downArrow) setSelectedIndex((index) => Math.min(Math.max(0, revisions.length - 1), index + 1));
      else if ((key.return || input === '\r' || input === '\n') && selected) setScreen('detail');
      else if (input === 'q' || key.escape) onCancel();
      return;
    }
    if (!selected) { onCancel(); return; }
    if (screen === 'detail') {
      if ((key.return || input === '\r' || input === '\n') && !preparing) {
        if (onPrepare === undefined) setScreen('confirm');
        else { setPreparing(true); void onPrepare(selected).then((next) => { setOperation(next); setPreparing(false); setScreen('confirm'); }).catch(() => setPreparing(false)); }
      } else if (input === 'b' || key.escape) setScreen('list');
      return;
    }
    if (input.toLowerCase() === 'y' || key.return) { if (!preparing) onConfirm(selected, operationPreview); }
    else if (input.toLowerCase() === 'n' || key.escape) { if (operation !== undefined && onReject !== undefined) void onReject(operation); setOperation(undefined); setScreen('detail'); }
  });
  if (screen === 'list') return <Box flexDirection="column"><Text bold>Configurations</Text>{revisions.length === 0 ? <Text>no configuration revisions</Text> : revisions.map((revision, index) => <Text key={revision.revisionId} color={index === selectedIndex ? 'cyan' : undefined}>{index === selectedIndex ? '› ' : '  '}{revision.configName} {revision.revisionId}</Text>)}<Text dimColor>Enter: details  q/Esc: quit</Text></Box>;
  if (screen === 'detail') {
    if (!selected) return <Text>no configuration selected</Text>;
    return <Box flexDirection="column"><Text>{renderDetail(selected)}</Text><Text dimColor>{preparing ? 'preparing activation...' : 'Enter: prepare activation  b/Esc: back'}</Text></Box>;
  }
  if (!selected) return <Text>no configuration selected</Text>;
  return <Box flexDirection="column"><Text>{renderConfirmationSummary(operationPreview, selected)}</Text><Text dimColor>y/Enter: confirm and execute  n/Esc: cancel</Text></Box>;
}

type TuiDecision = { readonly kind: 'launch'; readonly revision: ConfigurationRevision; readonly operation: ActivationOperation } | { readonly kind: 'quit' };

function runTuiScreen(revisions: readonly ConfigurationRevision[], prepare: (revision: ConfigurationRevision) => Promise<ActivationOperation>, reject: (operation: ActivationOperation) => Promise<void>): Promise<TuiDecision> {
  let resolveDecision!: (decision: TuiDecision) => void;
  const promise = new Promise<TuiDecision>((resolve) => { resolveDecision = resolve; });
  const instance = render(<TuiApp revisions={revisions} onPrepare={prepare} onReject={reject} onConfirm={(revision, operation) => { if (operation === undefined) return; instance.unmount(); resolveDecision({ kind: 'launch', revision, operation }); }} onCancel={() => { instance.unmount(); resolveDecision({ kind: 'quit' }); }} />);
  return promise;
}

export async function runTuiWithDeps(deps: FullDeps): Promise<number> {
  const revisions = await listConfigRevisions(deps.configurations);
  const decision = await runTuiScreen(revisions, (revision) => prepareActivation(deps, { revisionId: revision.revisionId, agentId: agentId('omp') }), (operation) => rejectActivation(deps, operation.operationId).then(() => undefined));
  if (decision.kind === 'quit') return 0;
  if (decision.operation.phase !== 'awaiting-confirmation') { console.error(renderFailure(decision.operation)); return 1; }
  await confirmActivation(deps, decision.operation.operationId);
  console.log(renderHandoffLine());
  const completed = await executeActivation(deps, decision.operation.operationId);
  if (completed.phase !== 'succeeded' && completed.phase !== 'degraded') { console.error(renderFailure(completed)); return 1; }
  const status: ActivationStatus = { operation: completed, operationPhase: completed.phase, observations: await deps.observations.listByOperation(completed.operationId), observationStage: 'outcome-observed', nextStep: 'no further action is required' };
  console.log(renderStatus(status));
  return 0;
}

export async function runTui(overrides: CliOverrides = {}): Promise<number> {
  let deps: FullDeps;
  try { deps = openDeps(overrides); } catch (error) { console.error(renderQueryFailure(error)); return 1; }
  try { return await runTuiWithDeps(deps); } finally { deps.store.close(); }
}
