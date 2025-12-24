import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useEffect, useMemo, useRef, useState } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

interface MessageListContext {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

const ItemContent = ({
  data,
  context,
}: {
  data: PatchTypeWithKey;
  context: MessageListContext;
}) => {
  const attempt = context?.attempt;
  const task = context?.task;

  if (data.type === 'STDOUT') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'STDERR') {
    return <p>{data.content}</p>;
  }
  if (data.type === 'NORMALIZED_ENTRY' && attempt) {
    return (
      <DisplayConversationEntry
        expansionKey={data.patchKey}
        entry={data.content}
        executionProcessId={data.executionProcessId}
        taskAttempt={attempt}
        task={task}
      />
    );
  }

  return null;
};

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const { setEntries, reset } = useEntries();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const addTypeRef = useRef<AddEntryType>('initial');

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    reset();
  }, [attempt.id, reset]);

  const onEntriesUpdated = (
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    addTypeRef.current = addType;
    setEntriesState(newEntries);
    setEntries(newEntries);

    if (loading) {
      setLoading(newLoading);
    }
  };

  useConversationHistory({ attempt, onEntriesUpdated });

  const messageListContext = useMemo(
    () => ({ attempt, task }),
    [attempt, task]
  );

  // Handle initial scroll to bottom and smooth scrolling for new messages
  useEffect(() => {
    if (entries.length === 0) return;

    // On initial load or when at bottom, scroll to the end
    if (addTypeRef.current === 'initial' || atBottom) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: entries.length - 1,
          align: 'end',
          behavior: addTypeRef.current === 'running' ? 'smooth' : 'auto',
        });
      });
    }
  }, [entries.length, atBottom]);

  return (
    <ApprovalFormProvider>
      <Virtuoso<PatchTypeWithKey>
        ref={virtuosoRef}
        className="flex-1"
        data={entries}
        computeItemKey={(_, data) => `l-${data.patchKey}`}
        itemContent={(_, data) => (
          <ItemContent data={data} context={messageListContext} />
        )}
        atBottomStateChange={setAtBottom}
        followOutput={atBottom ? 'smooth' : false}
        increaseViewportBy={{ top: 200, bottom: 200 }}
        components={{
          Header: () => <div className="h-2" />,
          Footer: () => <div className="h-2" />,
        }}
      />
      {loading && (
        <div className="float-left top-0 left-0 w-full h-full bg-primary flex flex-col gap-2 justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
