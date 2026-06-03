import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import {
  DEFAULT_CONTACT_PAGE,
  DEFAULT_CONTACT_PAGE_SIZE,
} from '../shared/constants.js';
import type {
  Contact,
  ContactImportCandidate,
  ContactQuery,
  ImportPreviewResult,
  ImportResult,
  MailDraft,
  MailDraftListItem,
  SendJob,
  SendQueueSummary,
} from '../shared/types.js';
import ProductsPanel from './components/ProductsPanel';
import SenderAccountsPanel from './components/SenderAccountsPanel';
import {
  parseContactsImportFile,
  type ContactImportRowInput,
} from './lib/contact-import';
import './styles/App.css';

type ThemeMode = 'dark' | 'light';
type PrimaryView = 'messages' | 'contacts' | 'smtp' | 'products' | 'reports';
type ReportTab = 'summary' | 'message' | 'recipients';
type PreviewScaleMode = 'fit-width' | 'fit-page' | 'actual';

const DEFAULT_PANE_WIDTHS: [number, number, number, number] = [250, 360, 920, 320];
const IDEAL_MIN_PANE_WIDTHS: [number, number, number, number] = [200, 240, 560, 260];
const ABS_MIN_PANE_WIDTHS: [number, number, number, number] = [120, 150, 280, 160];
const SPLITTER_WIDTH = 8;
const SPLITTER_COUNT = 3;
const TOTAL_SPLITTER_WIDTH = SPLITTER_WIDTH * SPLITTER_COUNT;

const IMPORT_SAMPLE_TEXT = [
  'alice@example.com,Alice,Wu,Acme',
  'bob@example.com,Bob,Li,Flow Team',
  'alice@example.com,Duplicate,User,Demo',
  'bad-email,Invalid,Format,Demo',
].join('\n');

const EMPTY_CONTACT_QUERY: ContactQuery = {
  keyword: '',
  page: DEFAULT_CONTACT_PAGE,
  pageSize: DEFAULT_CONTACT_PAGE_SIZE,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

type SplitterDragState = {
  splitterIndex: 0 | 1 | 2;
  startX: number;
  leftWidth: number;
  rightWidth: number;
};

type PaneLayout = {
  pane2: ReactNode;
  pane3: ReactNode;
  pane4: ReactNode;
  pane4ClassName?: string;
};

const DRAFT_STATUS_LABELS: Record<string, string> = {
  idle: '未发送',
  queued: '待发送',
  sending: '发送中',
  sent: '已完成',
  failed: '有失败',
};

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rowsToTextarea(rows: ContactImportRowInput[]): string {
  return rows
    .map((row) => [
      String(row.email ?? ''),
      String(row.firstName ?? ''),
      String(row.lastName ?? ''),
      String(row.company ?? ''),
    ].join(','))
    .join('\n');
}

function parseTextareaRows(text: string): ContactImportRowInput[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [email = '', firstName = '', lastName = '', company = ''] = line
        .split(',')
        .map((item) => item.trim());

      return {
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        company: company || null,
      };
    });
}

function getEffectiveMinPaneWidths(containerWidth: number): [number, number, number, number] {
  const available = Math.max(containerWidth - TOTAL_SPLITTER_WIDTH, sum(ABS_MIN_PANE_WIDTHS));
  const absTotal = sum(ABS_MIN_PANE_WIDTHS);
  const idealTotal = sum(IDEAL_MIN_PANE_WIDTHS);

  if (available <= absTotal) {
    return ABS_MIN_PANE_WIDTHS;
  }

  if (available >= idealTotal) {
    return IDEAL_MIN_PANE_WIDTHS;
  }

  const ratio = (available - absTotal) / (idealTotal - absTotal);

  return IDEAL_MIN_PANE_WIDTHS.map((ideal, index) => {
    const abs = ABS_MIN_PANE_WIDTHS[index];
    return Math.round(abs + (ideal - abs) * ratio);
  }) as [number, number, number, number];
}

function normalizePaneWidths(
  input: [number, number, number, number],
  containerWidth: number,
): [number, number, number, number] {
  const minimums = getEffectiveMinPaneWidths(containerWidth);
  const available = Math.max(containerWidth - TOTAL_SPLITTER_WIDTH, sum(minimums));
  const next = input.map((value, index) => Math.max(Math.round(value), minimums[index])) as [
    number,
    number,
    number,
    number,
  ];

  let total = sum(next);
  if (total < available) {
    next[2] += available - total;
    return next;
  }

  if (total === available) {
    return next;
  }

  let overflow = total - available;
  const shrinkOrder: Array<0 | 1 | 2 | 3> = [1, 0, 3, 2];
  for (const index of shrinkOrder) {
    if (overflow <= 0) {
      break;
    }

    const room = next[index] - minimums[index];
    if (room <= 0) {
      continue;
    }

    const delta = Math.min(room, overflow);
    next[index] -= delta;
    overflow -= delta;
  }

  total = sum(next);
  if (total < available) {
    next[2] += available - total;
  }

  return next;
}

function parseCommaSeparatedTags(value: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push(item);
    });
  return normalized;
}

function formatDraftStatus(summary: SendQueueSummary | null, queueStatus: string | null) {
  if (!summary || !queueStatus) {
    return '未发送';
  }

  const label = DRAFT_STATUS_LABELS[queueStatus] ?? queueStatus;
  if (summary.total === 0) {
    return label;
  }

  return `${label} · ${summary.sent}/${summary.total}`;
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [activeView, setActiveView] = useState<PrimaryView>('messages');
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('summary');
  const [paneWidths, setPaneWidths] = useState<[number, number, number, number]>(DEFAULT_PANE_WIDTHS);
  const dragStateRef = useRef<SplitterDragState | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const [importText, setImportText] = useState(IMPORT_SAMPLE_TEXT);
  const [importSourceLabel, setImportSourceLabel] = useState('文本输入');
  const [importSourceRows, setImportSourceRows] = useState(4);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const [contactQuery, setContactQuery] = useState<ContactQuery>(EMPTY_CONTACT_QUERY);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [isContactsLoading, setIsContactsLoading] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedTagFilter, setSelectedTagFilter] = useState('');
  const [selectedMainProductFilter, setSelectedMainProductFilter] = useState('');
  const [contactTagsDrafts, setContactTagsDrafts] = useState<Record<string, string>>({});
  const [tagsBusy, setTagsBusy] = useState(false);
  const [enrichingContactId, setEnrichingContactId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState('');
  const [contactsActionMessage, setContactsActionMessage] = useState('');

  const [drafts, setDrafts] = useState<MailDraftListItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraft, setActiveDraft] = useState<MailDraft | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftHtmlBody, setDraftHtmlBody] = useState('');
  const [draftTextBody, setDraftTextBody] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftError, setDraftError] = useState('');

  const [queueJobs, setQueueJobs] = useState<SendJob[]>([]);
  const [queueSummary, setQueueSummary] = useState<SendQueueSummary | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [queueMessage, setQueueMessage] = useState('');
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [previewScaleMode, setPreviewScaleMode] = useState<PreviewScaleMode>('fit-width');
  const [isPreviewFullscreenOpen, setIsPreviewFullscreenOpen] = useState(false);

  const selectedContact = useMemo(() => {
    return contacts.find((item) => item.id === selectedContactId) ?? null;
  }, [contacts, selectedContactId]);

  const availableTags = useMemo(() => {
    return [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const availableMainProducts = useMemo(() => {
    return [...new Set(
      contacts.flatMap((contact) => contact.enrichment?.mainProducts ?? []),
    )].sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const visiblePreviewErrors = useMemo(() => {
    return previewResult?.errors.slice(0, 300) ?? [];
  }, [previewResult]);

  const visibleCommitErrors = useMemo(() => {
    return commitResult?.errors.slice(0, 300) ?? [];
  }, [commitResult]);

  const draftRecipientTags = useMemo(() => {
    if (!activeDraft) {
      return [];
    }

    return [...new Set(activeDraft.recipients.flatMap((recipient) => recipient.tags))]
      .sort((a, b) => a.localeCompare(b));
  }, [activeDraft]);

  const draftRecipientMainProducts = useMemo(() => {
    if (!activeDraft) {
      return [];
    }

    return [...new Set(activeDraft.recipients.flatMap((recipient) => recipient.mainProducts))]
      .sort((a, b) => a.localeCompare(b));
  }, [activeDraft]);

  const workspaceStyle = useMemo(() => {
    return {
      '--pane-1': `${paneWidths[0]}px`,
      '--pane-2': `${paneWidths[1]}px`,
      '--pane-3': `${paneWidths[2]}px`,
      '--pane-4': `${paneWidths[3]}px`,
    } as CSSProperties;
  }, [paneWidths]);

  const previewHtml = useMemo(() => {
    return draftHtmlBody || '<p>暂无 HTML 内容，请先导入或编辑。</p>';
  }, [draftHtmlBody]);

  function getWorkspaceWidth() {
    return workspaceRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  useEffect(() => {
    function fitToContainer(containerWidth?: number) {
      const width = containerWidth ?? getWorkspaceWidth();
      setPaneWidths((prev) => normalizePaneWidths(prev, width));
    }

    const element = workspaceRef.current;
    if (!element) {
      return undefined;
    }

    fitToContainer(element.getBoundingClientRect().width);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        fitToContainer(entry?.contentRect.width);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleResize = () => fitToContainer();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) {
        return;
      }

      const containerWidth = getWorkspaceWidth();
      const minPaneWidths = getEffectiveMinPaneWidths(containerWidth);
      const deltaX = event.clientX - drag.startX;
      const leftMin = minPaneWidths[drag.splitterIndex];
      const rightMin = minPaneWidths[drag.splitterIndex + 1];
      const total = drag.leftWidth + drag.rightWidth;
      const nextLeft = clamp(drag.leftWidth + deltaX, leftMin, total - rightMin);
      const nextRight = total - nextLeft;

      setPaneWidths((prev) => {
        const next = [...prev] as [number, number, number, number];
        next[drag.splitterIndex] = Math.round(nextLeft);
        next[drag.splitterIndex + 1] = Math.round(nextRight);
        return normalizePaneWidths(next, containerWidth);
      });
    }

    function stopDragging() {
      dragStateRef.current = null;
      window.document.body.classList.remove('is-resizing');
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
    };
  }, [paneWidths]);

  useEffect(() => {
    if (!isPreviewFullscreenOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsPreviewFullscreenOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewFullscreenOpen]);

  useEffect(() => {
    if (activeView === 'contacts') {
      void loadContacts(EMPTY_CONTACT_QUERY);
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === 'messages') {
      void loadDraftList();
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'messages') {
      return;
    }

    if (!activeDraftId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [draft, summary, jobs] = await Promise.all([
          window.api.mailDrafts.get(activeDraftId),
          window.api.sendQueue.summary({ draftId: activeDraftId }),
          window.api.sendQueue.list({ draftId: activeDraftId, status: 'all', limit: 200 }),
        ]);

        if (cancelled) {
          return;
        }

        setDraftFormState(draft);
        setQueueSummary(summary);
        setQueueJobs(jobs);
      } catch (error) {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : '加载草稿详情失败');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDraftId, activeView]);

  function setDraftFormState(draft: MailDraft | null) {
    setActiveDraft(draft);
    setDraftTitle(draft?.title ?? '');
    setDraftSubject(draft?.subject ?? '');
    setDraftHtmlBody(draft?.htmlBody ?? '');
    setDraftTextBody(draft?.textBody ?? '');
  }

  async function loadContacts(query: ContactQuery) {
    setIsContactsLoading(true);
    try {
      const result = await window.api.contacts.list(query);
      setContacts(result.items);
      setContactsTotal(result.total);
      setSelectedContactId((current) => {
        if (current && result.items.some((item) => item.id === current)) {
          return current;
        }

        return result.items[0]?.id ?? null;
      });
      setContactTagsDrafts((current) => {
        const next = { ...current };
        result.items.forEach((contact) => {
          if (next[contact.id] == null) {
            next[contact.id] = contact.tags.join(', ');
          }
        });
        return next;
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '加载联系人失败');
    } finally {
      setIsContactsLoading(false);
    }
  }

  async function loadDraftList() {
    setDraftsLoading(true);
    try {
      const nextDrafts = await window.api.mailDrafts.list();
      setDrafts(nextDrafts);
      setActiveDraftId((current) => {
        if (current && nextDrafts.some((item) => item.id === current)) {
          return current;
        }
        return nextDrafts[0]?.id ?? null;
      });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '加载草稿失败');
    } finally {
      setDraftsLoading(false);
    }
  }

  async function loadActiveDraft(draftId: string) {
    try {
      const [draft, summary, jobs] = await Promise.all([
        window.api.mailDrafts.get(draftId),
        window.api.sendQueue.summary({ draftId }),
        window.api.sendQueue.list({ draftId, status: 'all', limit: 200 }),
      ]);

      setDraftFormState(draft);
      setQueueSummary(summary);
      setQueueJobs(jobs);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '加载草稿详情失败');
    }
  }

  async function refreshActiveDraftContext() {
    if (!activeDraftId) {
      return;
    }

    await Promise.all([
      loadDraftList(),
      loadActiveDraft(activeDraftId),
    ]);
  }

  async function handlePreviewImport(rows: ContactImportRowInput[]) {
    setIsPreviewing(true);
    setImportError('');
    setCommitResult(null);
    try {
      const result = await window.api.contacts.importPreview({ rows });
      setPreviewResult(result);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '预览失败');
      setPreviewResult(null);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handlePreviewFromTextarea() {
    const rows = parseTextareaRows(importText);
    setImportSourceLabel('文本输入');
    setImportSourceRows(rows.length);
    await handlePreviewImport(rows);
  }

  async function handleImportFile(file: File) {
    setImportError('');
    setPreviewResult(null);
    setCommitResult(null);

    try {
      const rows = await parseContactsImportFile(file);
      setImportText(rowsToTextarea(rows));
      setImportSourceLabel(`文件 ${file.name}`);
      setImportSourceRows(rows.length);
      await handlePreviewImport(rows);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '文件解析失败');
    }
  }

  async function handleCommitImport() {
    if (!previewResult || previewResult.candidates.length === 0) {
      return;
    }

    setIsCommitting(true);
    setImportError('');
    try {
      const payload: ContactImportCandidate[] = previewResult.candidates;
      const result = await window.api.contacts.importCommit({ candidates: payload });
      setCommitResult(result);
      await loadContacts(contactQuery);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败');
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleSearchContacts() {
    const nextQuery = {
      ...contactQuery,
      page: DEFAULT_CONTACT_PAGE,
    };
    setContactQuery(nextQuery);
    await loadContacts(nextQuery);
  }

  function toggleContactSelection(contactId: string) {
    setSelectedContactIds((current) => {
      return current.includes(contactId)
        ? current.filter((item) => item !== contactId)
        : [...current, contactId];
    });
  }

  function appendSelection(contactIds: string[]) {
    setSelectedContactIds((current) => {
      const seen = new Set(current);
      const next = [...current];
      contactIds.forEach((contactId) => {
        if (!seen.has(contactId)) {
          seen.add(contactId);
          next.push(contactId);
        }
      });
      return next;
    });
  }

  function handleSelectByTag() {
    if (!selectedTagFilter) {
      return;
    }

    const matched = contacts
      .filter((contact) => contact.tags.includes(selectedTagFilter))
      .map((contact) => contact.id);

    appendSelection(matched);
    setContactsActionMessage(`已追加勾选标签 “${selectedTagFilter}” 的 ${matched.length} 位联系人。`);
  }

  function handleSelectByMainProduct() {
    if (!selectedMainProductFilter) {
      return;
    }

    const matched = contacts
      .filter((contact) => (contact.enrichment?.mainProducts ?? []).includes(selectedMainProductFilter))
      .map((contact) => contact.id);

    appendSelection(matched);
    setContactsActionMessage(`已追加勾选主营产品 “${selectedMainProductFilter}” 的 ${matched.length} 位联系人。`);
  }

  async function handleSaveContactTags() {
    if (!selectedContact) {
      return;
    }

    setTagsBusy(true);
    setEnrichError('');
    try {
      await window.api.contacts.updateTags({
        contactId: selectedContact.id,
        tags: parseCommaSeparatedTags(
          contactTagsDrafts[selectedContact.id] ?? selectedContact.tags.join(', '),
        ),
      });
      await loadContacts(contactQuery);
      setContactsActionMessage('联系人标签已保存。');
    } catch (error) {
      setEnrichError(error instanceof Error ? error.message : '保存标签失败');
    } finally {
      setTagsBusy(false);
    }
  }

  async function handleEnrichContact(contactId: string) {
    setEnrichingContactId(contactId);
    setEnrichError('');
    try {
      await window.api.contacts.enrich({ contactId });
      await loadContacts(contactQuery);
    } catch (error) {
      setEnrichError(error instanceof Error ? error.message : '分析失败');
    } finally {
      setEnrichingContactId(null);
    }
  }

  async function handleCreateDraftFromSelection() {
    if (selectedContactIds.length === 0) {
      return;
    }

    setDraftBusy(true);
    setDraftError('');
    try {
      const draft = await window.api.mailDrafts.createFromContacts({
        contactIds: selectedContactIds,
      });
      setActiveView('messages');
      setActiveDraftId(draft.id);
      setSelectedContactIds([]);
      setContactsActionMessage('');
      setDraftMessage('已根据所选联系人创建邮件草稿。');
      await loadDraftList();
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '创建草稿失败');
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleSaveDraft() {
    if (!activeDraftId) {
      return;
    }

    setDraftBusy(true);
    setDraftMessage('');
    setDraftError('');
    try {
      const draft = await window.api.mailDrafts.update({
        draftId: activeDraftId,
        title: draftTitle,
        subject: draftSubject,
        htmlBody: draftHtmlBody,
        textBody: draftTextBody,
      });
      setDraftFormState(draft);
      setDraftMessage('草稿已保存。');
      await loadDraftList();
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '保存草稿失败');
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleImportDraftHtml(file: File) {
    if (!activeDraftId) {
      return;
    }

    setDraftBusy(true);
    setDraftMessage('');
    setDraftError('');
    try {
      const html = await file.text();
      const draft = await window.api.mailDrafts.update({
        draftId: activeDraftId,
        htmlBody: html,
      });
      setDraftFormState(draft);
      setDraftMessage(`已导入 HTML：${file.name}`);
      await loadDraftList();
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '导入 HTML 失败');
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleRemoveDraftRecipient(contactId: string) {
    if (!activeDraftId) {
      return;
    }

    setDraftBusy(true);
    setDraftError('');
    try {
      const draft = await window.api.mailDrafts.removeRecipient({
        draftId: activeDraftId,
        contactId,
      });
      setDraftFormState(draft);
      setDraftMessage('已从本次冻结快照中移除联系人。');
      await loadDraftList();
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : '移除联系人失败');
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleEnqueueDraft() {
    if (!activeDraftId) {
      return;
    }

    setQueueBusy(true);
    setQueueError('');
    setQueueMessage('');
    try {
      const result = await window.api.sendQueue.enqueue({ draftId: activeDraftId });
      setQueueMessage(`已把当前草稿加入队列：${result.inserted} 条，跳过 ${result.skipped} 条。`);
      if (result.invalidRecipients.length > 0) {
        setQueueError(`无效邮箱：${result.invalidRecipients.slice(0, 5).join(', ')}`);
      }
      await refreshActiveDraftContext();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : '加入队列失败');
    } finally {
      setQueueBusy(false);
    }
  }

  async function handleQueueControl(action: 'start' | 'pause' | 'resume') {
    setQueueBusy(true);
    setQueueError('');
    setQueueMessage('');
    try {
      const result = action === 'start'
        ? await window.api.sendQueue.start()
        : action === 'pause'
          ? await window.api.sendQueue.pause()
          : await window.api.sendQueue.resume();

      setQueueMessage(result.message);
      if (activeDraftId) {
        const summary = await window.api.sendQueue.summary({ draftId: activeDraftId });
        setQueueSummary(summary);
      } else {
        setQueueSummary(result.summary);
      }
      await refreshActiveDraftContext();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : '发送控制失败');
    } finally {
      setQueueBusy(false);
    }
  }

  function handleStartDrag(splitterIndex: 0 | 1 | 2, clientX: number) {
    dragStateRef.current = {
      splitterIndex,
      startX: clientX,
      leftWidth: paneWidths[splitterIndex],
      rightWidth: paneWidths[splitterIndex + 1],
    };
    window.document.body.classList.add('is-resizing');
  }

  function renderMessagesPane2() {
    return (
      <>
        <header className="pane-header">
          <div>
            <h2>Messages</h2>
            <p className="pane-subtitle">邮件草稿列表</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => void loadDraftList()}>
            刷新
          </button>
        </header>

        <section className="panel">
          <p className="eyebrow">草稿仓</p>
          <p className="hint">左侧只管理草稿，收件人请从 Contacts 勾选后创建。</p>
        </section>

        <div className="message-list">
          {draftsLoading ? (
            <p className="hint">草稿加载中...</p>
          ) : drafts.length === 0 ? (
            <p className="hint">还没有草稿。先去 Contacts 勾选联系人，然后点击“创建邮件”。</p>
          ) : (
            drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                className={`message-item ${draft.id === activeDraftId ? 'active' : ''}`}
                onClick={() => setActiveDraftId(draft.id)}
              >
                <span className="message-title">{draft.title}</span>
                <span className="message-date">
                  {draft.recipientCount} 人 · {formatDraftStatus(draft.sendSummary, draft.queueStatus)}
                </span>
              </button>
            ))
          )}
        </div>
      </>
    );
  }

  function renderMessagesPane3() {
    if (!activeDraft) {
      return (
        <section className="panel">
          <p className="eyebrow">编辑器</p>
          <p className="hint">当前没有打开的草稿。先去 Contacts 勾选联系人，再创建邮件草稿。</p>
        </section>
      );
    }

    return (
      <div className="editor-shell">
        <section className="messages-main">
          <div className="composer-toolbar">
            <label className="action-chip file-btn">
              导入 HTML
              <input
                type="file"
                accept=".html,.htm,text/html"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImportDraftHtml(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>
            <button className="action-chip" type="button" onClick={() => void handleSaveDraft()} disabled={draftBusy}>
              {draftBusy ? '保存中...' : '保存草稿'}
            </button>
            <span className="editor-hint">第一版以 HTML 导入 + 实时预览为主，后续再补更完整的可视化块编辑。</span>
          </div>

          <div className="field-grid">
            <label htmlFor="draft-title">草稿名称</label>
            <input
              id="draft-title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="给这封邮件起个名字"
            />
            <label htmlFor="draft-subject">邮件主题</label>
            <input
              id="draft-subject"
              value={draftSubject}
              onChange={(event) => setDraftSubject(event.target.value)}
              placeholder="输入邮件主题"
            />
          </div>

          <div className="editor-surface">
            <div className="newsletter-preview-header">
              <div className="newsletter-preview-meta">
                <span className="preview-badge">Preview</span>
                <span>{activeDraft.recipients.length} 位收件人冻结快照</span>
              </div>
              <div className="preview-toolbar" role="toolbar" aria-label="邮件预览控制">
                <button
                  className={`ghost-btn ${previewScaleMode === 'fit-width' ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setPreviewScaleMode('fit-width')}
                >
                  适配宽度
                </button>
                <button
                  className={`ghost-btn ${previewScaleMode === 'fit-page' ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setPreviewScaleMode('fit-page')}
                >
                  缩小总览
                </button>
                <button
                  className={`ghost-btn ${previewScaleMode === 'actual' ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setPreviewScaleMode('actual')}
                >
                  原始比例
                </button>
                <button className="ghost-btn" type="button" onClick={() => setIsPreviewFullscreenOpen(true)}>
                  全屏查看
                </button>
              </div>
            </div>
            <div className={`preview-stage preview-stage--${previewScaleMode}`}>
              <div className="preview-document-shell">
                <div className="newsletter-canvas">
                  <div
                    className="newsletter-preview-html"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="editor-panels">
            <section className="panel">
              <p className="eyebrow">HTML 内容</p>
              <textarea
                className="import-textarea html-source-textarea"
                value={draftHtmlBody}
                onChange={(event) => setDraftHtmlBody(event.target.value)}
                placeholder="在这里粘贴或编辑 HTML"
              />
            </section>
            <section className="panel">
              <p className="eyebrow">纯文本回退</p>
              <textarea
                className="import-textarea plain-text-textarea"
                value={draftTextBody}
                onChange={(event) => setDraftTextBody(event.target.value)}
                placeholder="邮件纯文本版本"
              />
            </section>
          </div>

          <div className="queue-strip">
            <div className="queue-strip__summary">
              <strong>{formatDraftStatus(queueSummary, activeDraft.queueStatus)}</strong>
              <span>总计 {queueSummary?.total ?? 0}</span>
              <span>待发送 {queueSummary?.pending ?? 0}</span>
              <span>发送中 {queueSummary?.sending ?? 0}</span>
              <span>已完成 {queueSummary?.sent ?? 0}</span>
              <span>失败 {queueSummary?.failed ?? 0}</span>
            </div>
            <div className="queue-strip__actions">
              <button className="btn" type="button" onClick={() => void handleEnqueueDraft()} disabled={queueBusy || draftBusy || activeDraft.recipients.length === 0}>
                加入发送队列
              </button>
              <button className="btn secondary" type="button" onClick={() => void handleQueueControl('start')} disabled={queueBusy}>
                开始发送
              </button>
              <button className="btn secondary" type="button" onClick={() => void handleQueueControl('pause')} disabled={queueBusy}>
                暂停
              </button>
              <button className="btn secondary" type="button" onClick={() => void handleQueueControl('resume')} disabled={queueBusy}>
                恢复
              </button>
              <button className="ghost-btn" type="button" onClick={() => setShowQueueDetails((current) => !current)}>
                {showQueueDetails ? '收起详情' : '查看详情'}
              </button>
            </div>
            {queueMessage ? <p className="smtp-success queue-strip__feedback">{queueMessage}</p> : null}
            {queueError ? <p className="smtp-error queue-strip__feedback">{queueError}</p> : null}
            {draftMessage ? <p className="smtp-success queue-strip__feedback">{draftMessage}</p> : null}
            {draftError ? <p className="smtp-error queue-strip__feedback">{draftError}</p> : null}
            {showQueueDetails ? (
              <div className="queue-details">
                {queueJobs.length === 0 ? (
                  <p className="hint">当前草稿还没有生成发送任务。</p>
                ) : (
                  <div className="table-wrap">
                    <table className="contacts-table">
                      <thead>
                        <tr>
                          <th>收件人</th>
                          <th>状态</th>
                          <th>尝试</th>
                          <th>错误</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queueJobs.map((job) => (
                          <tr key={job.id}>
                            <td>{job.to}</td>
                            <td>{job.status}</td>
                            <td>{job.attemptCount}/{job.maxAttempts}</td>
                            <td>{job.lastError ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  function renderMessagesPane4() {
    if (!activeDraft) {
      return (
        <section className="panel">
          <p className="eyebrow">收件人快照</p>
          <p className="hint">创建草稿后，这里会展示本次发送对象的冻结快照摘要。</p>
        </section>
      );
    }

    return (
      <>
        <section className="panel">
          <p className="eyebrow">收件人快照</p>
          <p className="result"><strong>人数：</strong>{activeDraft.recipients.length}</p>
          <p className="result"><strong>标签：</strong>{draftRecipientTags.length > 0 ? draftRecipientTags.join('、') : '暂无'}</p>
          <p className="result"><strong>主营产品：</strong>{draftRecipientMainProducts.length > 0 ? draftRecipientMainProducts.join('、') : '暂无'}</p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setActiveView('contacts')}
          >
            返回 Contacts 重新选择
          </button>
        </section>

        <section className="panel">
          <p className="eyebrow">联系人明细</p>
          <div className="recipient-list">
            {activeDraft.recipients.map((recipient) => (
              <article key={recipient.contactId} className="recipient-card">
                <div>
                  <strong>{recipient.email}</strong>
                  <p className="hint recipient-card__meta">
                    {[recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || '未命名联系人'}
                    {recipient.company ? ` · ${recipient.company}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => void handleRemoveDraftRecipient(recipient.contactId)}
                  disabled={draftBusy}
                >
                  移除
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">编辑辅助</p>
          <p className="hint">这里保留本地编辑辅助，不做模板市场。后续会接签名、页脚、AI 生成和 HTML 清洗。</p>
        </section>
      </>
    );
  }

  function renderContactsPane2() {
    return (
      <>
        <header className="pane-header">
          <div>
            <h2>Contacts</h2>
            <p className="pane-subtitle">联系人选择与筛选</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => void handleSearchContacts()}>
            刷新
          </button>
        </header>

        <div className="row">
          <input
            className="text-input compact-input"
            placeholder="输入关键词过滤 email / 姓名 / 公司"
            value={contactQuery.keyword ?? ''}
            onChange={(event) => setContactQuery((prev) => ({ ...prev, keyword: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleSearchContacts();
              }
            }}
          />
          <button className="btn secondary" type="button" onClick={() => void handleSearchContacts()}>
            搜索
          </button>
        </div>

        <section className="panel">
          <p className="eyebrow">勾选方式</p>
          <p className="hint">支持单个勾选，也支持按人工标签和主营产品批量追加勾选。</p>
          <div className="selection-toolbar">
            <select
              className="text-input"
              value={selectedTagFilter}
              onChange={(event) => setSelectedTagFilter(event.target.value)}
            >
              <option value="">按标签批量勾选</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <button className="btn secondary" type="button" onClick={handleSelectByTag} disabled={!selectedTagFilter}>
              追加
            </button>
          </div>
          <div className="selection-toolbar">
            <select
              className="text-input"
              value={selectedMainProductFilter}
              onChange={(event) => setSelectedMainProductFilter(event.target.value)}
            >
              <option value="">按主营产品批量勾选</option>
              {availableMainProducts.map((product) => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
            <button className="btn secondary" type="button" onClick={handleSelectByMainProduct} disabled={!selectedMainProductFilter}>
              追加
            </button>
          </div>
          <div className="row">
            <strong>已选 {selectedContactIds.length} 位</strong>
            <button className="btn secondary" type="button" onClick={() => setSelectedContactIds([])}>
              清空已选
            </button>
            <button className="btn" type="button" onClick={() => void handleCreateDraftFromSelection()} disabled={draftBusy || selectedContactIds.length === 0}>
              {draftBusy ? '创建中...' : '创建邮件'}
            </button>
          </div>
          {contactsActionMessage ? <p className="smtp-success">{contactsActionMessage}</p> : null}
        </section>

        <div className="table-wrap">
          <table className="contacts-table">
            <thead>
              <tr>
                <th>选中</th>
                <th>Email</th>
                <th>First</th>
                <th>Last</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((item) => (
                <tr
                  key={item.id}
                  className={selectedContactId === item.id ? 'row-selected' : ''}
                  onClick={() => setSelectedContactId(item.id)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedContactIds.includes(item.id)}
                      onChange={() => toggleContactSelection(item.id)}
                    />
                  </td>
                  <td>{item.email}</td>
                  <td>{item.firstName ?? '-'}</td>
                  <td>{item.lastName ?? '-'}</td>
                  <td>{item.company ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">{isContactsLoading ? '加载中...' : `总数：${contactsTotal}`}</p>
      </>
    );
  }

  function renderContactsPane3() {
    return (
      <section className="panel">
        <p className="eyebrow">联系人导入预览</p>
        <p className="hint">每行一个联系人，格式：email,firstName,lastName,company</p>
        <div className="row">
          <label className="btn file-btn">
            选择 CSV / XLSX 文件
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportFile(file);
                }
                event.target.value = '';
              }}
            />
          </label>
          <button type="button" className="btn" onClick={() => void handlePreviewFromTextarea()} disabled={isPreviewing}>
            {isPreviewing ? '预览中...' : '预览导入'}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => void handleCommitImport()}
            disabled={isCommitting || !previewResult || previewResult.candidates.length === 0}
          >
            {isCommitting ? '提交中...' : '提交导入'}
          </button>
        </div>
        <p className="hint">当前来源：{importSourceLabel}（{importSourceRows} 行）</p>
        <textarea className="import-textarea" value={importText} onChange={(event) => setImportText(event.target.value)} />

        {previewResult ? (
          <div className="sub-block">
            <p className="result">预览完成：有效 {previewResult.validRows}，无效 {previewResult.invalidRows}。</p>
            <p className="hint">
              候选 {previewResult.candidates.length} 条，错误 {previewResult.errors.length} 条。
              {previewResult.errors.length > visiblePreviewErrors.length ? `（仅显示前 ${visiblePreviewErrors.length} 条）` : ''}
            </p>
          </div>
        ) : null}

        {previewResult && visiblePreviewErrors.length > 0 ? (
          <div className="sub-block">
            <p className="sub-title">预览错误明细</p>
            <div className="table-wrap">
              <table className="contacts-table">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>错误码</th>
                    <th>消息</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePreviewErrors.map((error, index) => (
                    <tr key={`${error.code}-${error.rowNumber}-${index}`}>
                      <td>{error.rowNumber}</td>
                      <td>{error.code}</td>
                      <td>{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {commitResult ? (
          <div className="sub-block">
            <p className="result">导入结果：插入 {commitResult.insertedRows}，跳过 {commitResult.skippedRows}。</p>
            {visibleCommitErrors.length > 0 ? (
              <div className="table-wrap">
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th>行号</th>
                      <th>错误码</th>
                      <th>消息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCommitErrors.map((error, index) => (
                      <tr key={`${error.code}-${error.rowNumber}-${index}`}>
                        <td>{error.rowNumber}</td>
                        <td>{error.code}</td>
                        <td>{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {importError ? <p className="smtp-error">{importError}</p> : null}
      </section>
    );
  }

  function renderContactsPane4() {
    if (!selectedContact) {
      return (
        <section className="panel">
          <p className="eyebrow">联系人详情</p>
          <p className="hint">从列表中选择一个联系人后，可以维护人工标签和查看 AI 分析。</p>
        </section>
      );
    }

    const enrichment = selectedContact.enrichment;
    const matchedProducts = enrichment?.matchedProducts ?? [];
    const emailDraft = enrichment?.emailDraft ?? null;

    return (
      <>
        <section className="panel">
          <p className="eyebrow">当前联系人</p>
          <div className="row">
            <strong>{selectedContact.email}</strong>
            <span>{selectedContact.firstName ?? '-'} {selectedContact.lastName ?? ''}</span>
            <span>{selectedContact.company ?? '-'}</span>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">人工标签</p>
          <p className="hint">逗号分隔，例如：重点客户, 德国市场, 已报价</p>
          <textarea
            className="import-textarea tags-textarea"
            value={contactTagsDrafts[selectedContact.id] ?? selectedContact.tags.join(', ')}
            onChange={(event) => setContactTagsDrafts((current) => ({
              ...current,
              [selectedContact.id]: event.target.value,
            }))}
          />
          <button className="btn" type="button" onClick={() => void handleSaveContactTags()} disabled={tagsBusy}>
            {tagsBusy ? '保存中...' : '保存标签'}
          </button>
        </section>

        <section className="panel">
          <p className="eyebrow">AI 客户分析</p>
          {enrichment ? (
            <div className="sub-block">
              <div className="row">
                <span className={`smtp-${enrichment.status === 'done' ? 'success' : 'error'}`}>
                  {enrichment.status === 'done'
                    ? '✓ 已完成'
                    : enrichment.status === 'in_progress'
                      ? '⏳ 分析中'
                      : enrichment.status === 'failed'
                        ? '✗ 失败'
                        : '○ 待处理'}
                </span>
                <span className="hint">置信度: {(enrichment.confidence * 100).toFixed(0)}%</span>
              </div>
              {enrichment.companyName ? <p className="result"><strong>公司：</strong>{enrichment.companyName}</p> : null}
              {enrichment.industry ? <p className="result"><strong>行业：</strong>{enrichment.industry}</p> : null}
              {enrichment.mainProducts.length > 0 ? <p className="result"><strong>主营产品：</strong>{enrichment.mainProducts.join('、')}</p> : null}
              {matchedProducts.length > 0 ? (
                <div className="sub-block">
                  <p className="sub-title">推荐产品</p>
                  {matchedProducts.map((item) => (
                    <p key={item.productId} className="result">
                      <strong>{item.productName}</strong>（{Math.round(item.confidence * 100)}%）：{item.matchReason}
                    </p>
                  ))}
                </div>
              ) : null}
              {emailDraft ? (
                <div className="sub-block">
                  <p className="sub-title">AI 邮件草稿参考</p>
                  <p className="result"><strong>主题：</strong>{emailDraft.subject}</p>
                  <textarea className="import-textarea draft-textarea" readOnly value={emailDraft.body} />
                </div>
              ) : null}
              {enrichment.errorMessage ? <p className="smtp-error">{enrichment.errorMessage}</p> : null}
            </div>
          ) : (
            <p className="hint">尚未分析。点击下方按钮获取客户网站信息并分析其业务。</p>
          )}

          <div className="row sub-block">
            <button
              type="button"
              className="btn"
              onClick={() => void handleEnrichContact(selectedContact.id)}
              disabled={enrichingContactId === selectedContact.id}
            >
              {enrichingContactId === selectedContact.id ? '分析中...' : (enrichment ? '重新分析' : '开始分析')}
            </button>
          </div>
          {enrichError ? <p className="smtp-error">{enrichError}</p> : null}
        </section>
      </>
    );
  }

  function renderSmtpPane2() {
    return (
      <>
        <header className="pane-header">
          <div>
            <h2>SMTP</h2>
            <p className="pane-subtitle">发件账号管理</p>
          </div>
        </header>
        <section className="panel">
          <p className="eyebrow">账号池</p>
          <p className="hint">统一管理多个发件账号，后续用于轮询发送与频率控制。</p>
        </section>
      </>
    );
  }

  function renderSmtpPane3() {
    return <SenderAccountsPanel />;
  }

  function renderSmtpPane4() {
    return (
      <section className="panel">
        <p className="eyebrow">发送策略提示</p>
        <p className="hint">建议先准备 2-3 个可用 SMTP 账号，后续再配置轮询与限速策略。</p>
        <p className="hint">测试连接通过后再进入批量发送模块，可以减少任务中断。</p>
      </section>
    );
  }

  function renderProductsPane2() {
    return (
      <>
        <header className="pane-header">
          <div>
            <h2>Products</h2>
            <p className="pane-subtitle">产品库管理</p>
          </div>
        </header>
        <section className="panel">
          <p className="eyebrow">产品定位</p>
          <p className="hint">联系人分析后，系统会根据产品库自动推荐最匹配产品。</p>
        </section>
      </>
    );
  }

  function renderProductsPane3() {
    return <ProductsPanel />;
  }

  function renderProductsPane4() {
    return (
      <section className="panel">
        <p className="eyebrow">字段建议</p>
        <p className="hint">产品描述里建议包含行业关键词、目标市场和卖点，便于 AI 匹配。</p>
        <p className="hint">后续可将产品与邮件正文生成打通，实现“按客户画像自动拟稿”。</p>
      </section>
    );
  }

  function renderReportsPane2() {
    return (
      <>
        <header className="pane-header">
          <div>
            <h2>Reports</h2>
            <p className="pane-subtitle">Send Bulk Email</p>
          </div>
        </header>
        <div className="message-list">
          <button className="message-item active" type="button">
            <span className="message-title">Join Us for an Unforgettable...</span>
            <span className="message-date">10,000 · Today, 12:03 PM</span>
          </button>
        </div>
      </>
    );
  }

  function renderReportsPane3() {
    return (
      <>
        <div className="report-toolbar">
          <div className="tab-header">
            {(['summary', 'message', 'recipients'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`tab-btn ${activeReportTab === tab ? 'active' : ''}`}
                onClick={() => setActiveReportTab(tab)}
              >
                {tab[0].toUpperCase()}{tab.slice(1)}
              </button>
            ))}
          </div>
          <button className="ghost-btn" type="button">Share</button>
        </div>

        <div className="delivery-bar">
          <span>2,571 of 10,000 sent</span>
          <div className="delivery-progress-wrap">
            <progress value={2571} max={10000} />
            <button className="manage-btn" type="button">Manage Delivery</button>
          </div>
        </div>

        <h3 className="headline">Join Us for an Unforgettable Evening!</h3>

        <section className="summary-grid">
          <article className="summary-card">
            <p className="card-label">STATUS</p>
            <p className="card-value">Sending</p>
            <p className="card-sub">Scheduled · Tuesday, 12:03 PM</p>
          </article>
          <article className="summary-card">
            <p className="card-label">RECIPIENTS</p>
            <p className="card-value">10,000</p>
            <p className="card-sub">Main List</p>
          </article>
          <article className="summary-card">
            <p className="card-label">DELIVERED</p>
            <p className="card-value">24%</p>
            <p className="card-sub">2,365 emails via localhost</p>
          </article>
          <article className="summary-card">
            <p className="card-label">UNSUBSCRIBED</p>
            <p className="card-value">0%</p>
            <p className="card-sub">0 recipients</p>
          </article>
        </section>
      </>
    );
  }

  function renderReportsPane4() {
    return (
      <section className="panel">
        <p className="eyebrow">报表说明</p>
        <p className="hint">这里预留给后续的打开率、点击率、退订率以及按发件账号维度筛选。</p>
        <p className="hint">后续接入真实发送任务后，这一栏会变成可筛选的统计面板。</p>
      </section>
    );
  }

  function buildPaneLayout(): PaneLayout {
    switch (activeView) {
      case 'messages':
        return {
          pane2: renderMessagesPane2(),
          pane3: renderMessagesPane3(),
          pane4: renderMessagesPane4(),
          pane4ClassName: 'pane messages-inspector',
        };
      case 'contacts':
        return {
          pane2: renderContactsPane2(),
          pane3: renderContactsPane3(),
          pane4: renderContactsPane4(),
        };
      case 'smtp':
        return {
          pane2: renderSmtpPane2(),
          pane3: renderSmtpPane3(),
          pane4: renderSmtpPane4(),
        };
      case 'products':
        return {
          pane2: renderProductsPane2(),
          pane3: renderProductsPane3(),
          pane4: renderProductsPane4(),
        };
      case 'reports':
        return {
          pane2: renderReportsPane2(),
          pane3: renderReportsPane3(),
          pane4: renderReportsPane4(),
        };
      default:
        return { pane2: null, pane3: null, pane4: null };
    }
  }

  const { pane2, pane3, pane4, pane4ClassName } = buildPaneLayout();

  const workspaceClassName = [
    'workspace',
    'layout-four-pane',
    themeMode === 'dark' ? 'theme-dark' : '',
  ].join(' ').trim();

  return (
    <main ref={workspaceRef} className={workspaceClassName} style={workspaceStyle}>
      <aside className="sidebar">
        <div className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="sidebar-top">
          <button
            type="button"
            className={`nav-item nav-item--messages ${activeView === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveView('messages')}
          >
            Messages
          </button>
          <button
            type="button"
            className={`nav-item nav-item--contacts ${activeView === 'contacts' ? 'active' : ''}`}
            onClick={() => setActiveView('contacts')}
          >
            Contacts
          </button>
          <button
            type="button"
            className={`nav-item nav-item--smtp ${activeView === 'smtp' ? 'active' : ''}`}
            onClick={() => setActiveView('smtp')}
          >
            SMTP
          </button>
          <button
            type="button"
            className={`nav-item nav-item--products ${activeView === 'products' ? 'active' : ''}`}
            onClick={() => setActiveView('products')}
          >
            Products
          </button>
          <button
            type="button"
            className={`nav-item nav-item--reports ${activeView === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveView('reports')}
          >
            Reports
          </button>
        </div>

        <div className="sidebar-groups">
          <p>Automation</p>
          <p>Integrations</p>
          <p>Autoresponders</p>
          <p>Compliance</p>
          <p>Personal Data</p>
          <p>Cloud</p>
          <p>Collaboration</p>
          <p>Sync Status</p>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
        >
          主题：{themeMode === 'dark' ? '暗黑' : '明亮'}
        </button>
      </aside>

      <div
        className="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(event) => handleStartDrag(0, event.clientX)}
      />

      <section className="pane pane-list">
        {pane2}
      </section>

      <div
        className="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(event) => handleStartDrag(1, event.clientX)}
      />

      <section className="pane pane-detail">
        {pane3}
      </section>

      <div
        className="pane-splitter"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(event) => handleStartDrag(2, event.clientX)}
      />

      <section className={pane4ClassName ?? 'pane pane-inspector'}>
        {pane4}
      </section>

      {isPreviewFullscreenOpen ? (
        <div
          className="preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label="邮件全屏预览"
          onClick={() => setIsPreviewFullscreenOpen(false)}
        >
          <div className="preview-modal__surface" onClick={(event) => event.stopPropagation()}>
            <div className="preview-modal__header">
              <div>
                <p className="eyebrow">全屏预览</p>
                <h3>{draftTitle || '未命名草稿'}</h3>
              </div>
              <div className="preview-toolbar" role="toolbar" aria-label="全屏邮件预览控制">
                <button
                  className={`ghost-btn ${previewScaleMode === 'fit-width' ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setPreviewScaleMode('fit-width')}
                >
                  适配宽度
                </button>
                <button
                  className={`ghost-btn ${previewScaleMode === 'fit-page' ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setPreviewScaleMode('fit-page')}
                >
                  缩小总览
                </button>
                <button
                  className={`ghost-btn ${previewScaleMode === 'actual' ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setPreviewScaleMode('actual')}
                >
                  原始比例
                </button>
                <button className="ghost-btn" type="button" onClick={() => setIsPreviewFullscreenOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
            <div className={`preview-stage preview-stage--fullscreen preview-stage--${previewScaleMode}`}>
              <div className="preview-document-shell">
                <div className="newsletter-canvas">
                  <div
                    className="newsletter-preview-html"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
