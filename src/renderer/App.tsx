import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppPingResult } from '../shared/ipc-api.js';
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
type PingStatus = 'idle' | 'loading' | 'done' | 'error';

const MIN_PANE_WIDTHS = [200, 240, 560, 260] as const;

const MESSAGE_LIST = [
  {
    id: 'm1',
    title: 'Sample Message',
    dateText: 'Today',
  },
  {
    id: 'm2',
    title: 'Welcome Campaign',
    dateText: 'Yesterday',
  },
];

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

function formatPingTime(value: AppPingResult['receivedAt']) {
  return new Date(value).toLocaleString('zh-CN');
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

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [activeView, setActiveView] = useState<PrimaryView>('messages');
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('summary');
  const [activeMessageId, setActiveMessageId] = useState(MESSAGE_LIST[0]?.id ?? 'm1');
  const [paneWidths, setPaneWidths] = useState<[number, number, number, number]>([
    250,
    360,
    920,
    320,
  ]);
  const dragStateRef = useRef<SplitterDragState | null>(null);

  const [pingStatus, setPingStatus] = useState<PingStatus>('idle');
  const [pingText, setPingText] = useState('还没有测试过');

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
  const [enrichingContactId, setEnrichingContactId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState('');

  const activeMessage = useMemo(() => {
    return MESSAGE_LIST.find((item) => item.id === activeMessageId) ?? MESSAGE_LIST[0];
  }, [activeMessageId]);

  const selectedContact = useMemo(() => {
    return contacts.find((item) => item.id === selectedContactId) ?? null;
  }, [contacts, selectedContactId]);

  const visiblePreviewErrors = useMemo(() => {
    if (!previewResult) {
      return [];
    }

    return previewResult.errors.slice(0, 300);
  }, [previewResult]);

  const visibleCommitErrors = useMemo(() => {
    if (!commitResult) {
      return [];
    }

    return commitResult.errors.slice(0, 300);
  }, [commitResult]);

  const messageLayoutStyle = useMemo(() => {
    if (activeView !== 'messages') {
      return undefined;
    }

    return {
      '--pane-1': `${paneWidths[0]}px`,
      '--pane-2': `${paneWidths[1]}px`,
      '--pane-3': `${paneWidths[2]}px`,
      '--pane-4': `${paneWidths[3]}px`,
    } as React.CSSProperties;
  }, [activeView, paneWidths]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) {
        return;
      }

      const deltaX = event.clientX - drag.startX;
      const leftMin = MIN_PANE_WIDTHS[drag.splitterIndex];
      const rightMin = MIN_PANE_WIDTHS[drag.splitterIndex + 1];
      const total = drag.leftWidth + drag.rightWidth;
      const nextLeft = clamp(drag.leftWidth + deltaX, leftMin, total - rightMin);
      const nextRight = total - nextLeft;

      setPaneWidths((prev) => {
        const next = [...prev] as [number, number, number, number];
        next[drag.splitterIndex] = Math.round(nextLeft);
        next[drag.splitterIndex + 1] = Math.round(nextRight);
        return next;
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
  }, []);

  useEffect(() => {
    if (activeView !== 'contacts') {
      return;
    }

    void loadContacts(EMPTY_CONTACT_QUERY);
  }, [activeView]);

  async function handlePing() {
    setPingStatus('loading');
    try {
      const result = await window.api.app.ping();
      setPingStatus('done');
      setPingText(`收到 ${result.message}，时间：${formatPingTime(result.receivedAt)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setPingStatus('error');
      setPingText(`调用失败：${message}`);
    }
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载联系人失败';
      setImportError(message);
    } finally {
      setIsContactsLoading(false);
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

  async function handlePreviewImport(rows: ContactImportRowInput[]) {
    setIsPreviewing(true);
    setImportError('');
    setCommitResult(null);
    try {
      const result = await window.api.contacts.importPreview({ rows });
      setPreviewResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '预览失败';
      setImportError(message);
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
      const message = error instanceof Error ? error.message : '文件解析失败';
      setImportError(message);
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
      const result = await window.api.contacts.importCommit({
        candidates: payload,
      });
      setCommitResult(result);
      await loadContacts(contactQuery);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败';
      setImportError(message);
    } finally {
      setIsCommitting(false);
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

  async function handleSearchContacts() {
    const query = {
      ...contactQuery,
      page: DEFAULT_CONTACT_PAGE,
    };
    setContactQuery(query);
    await loadContacts(query);
  }

  function renderMessagesMain() {
    return (
      <section className="messages-main">
        <div className="composer-toolbar">
          <button className="action-chip" type="button">Send Campaign</button>
          <button className="action-chip" type="button">Preview</button>
          <button className="action-chip" type="button">Optimize</button>
        </div>
        <div className="field-grid">
          <label htmlFor="from-name">From Name:</label>
          <input id="from-name" defaultValue="Enter your name" />
          <label htmlFor="from-email">From Email:</label>
          <input id="from-email" defaultValue="Enter your email address" />
          <label htmlFor="subject">Subject:</label>
          <input id="subject" defaultValue={activeMessage?.title ?? 'Sample Message'} />
        </div>
        <div className="block-toolbar">
          <button type="button">＋</button>
          <button type="button">T</button>
          <button type="button">🔗</button>
          <button type="button">🖼️</button>
          <button type="button">▶</button>
          <button type="button">🙂</button>
        </div>
        <article className="newsletter-canvas">
          <h2 className="newsletter-logo">hello.</h2>
          <h3>Welcome to our sample newsletter!</h3>
          <p>Here are some tips for getting started...</p>
          <hr />
          <div className="newsletter-image-placeholder">Image Block</div>
          <p>Use the toolbar above this message to add images, buttons, text, etc. to your newsletter.</p>
          <hr />
          <div className="newsletter-image-placeholder">Image Block</div>
        </article>
      </section>
    );
  }

  function renderMessagesInspector() {
    return (
      <aside className="pane messages-inspector">
        <div className="inspector-section">
          <h4>Template</h4>
          <p className="inspector-name">Name · Getting Started</p>
          <button type="button" className="inspector-btn">Choose Template...</button>
          <button type="button" className="inspector-btn">Import File...</button>
          <button type="button" className="inspector-btn">Import Webpage...</button>
        </div>
        <div className="inspector-section">
          <h4>Text Styles</h4>
          <ul className="style-list">
            <li><span>Heading 1</span><button type="button">Edit</button></li>
            <li><span>Heading 2</span><button type="button">Edit</button></li>
            <li><span>Heading 3</span><button type="button">Edit</button></li>
            <li><span>Paragraph</span><button type="button">Edit</button></li>
          </ul>
        </div>
        <div className="inspector-section">
          <h4>Color Scheme</h4>
          <div className="color-row"><span>Background</span><input type="color" defaultValue="#ffffff" /></div>
          <div className="color-row"><span>Links</span><input type="color" defaultValue="#f08c2f" /></div>
          <div className="color-row"><span>Button Text</span><input type="color" defaultValue="#ffffff" /></div>
          <div className="color-row"><span>Button Bg</span><input type="color" defaultValue="#f08c2f" /></div>
        </div>
      </aside>
    );
  }

  function renderContactsDetail() {
    return (
      <section className="pane pane-detail">
        {selectedContact ? (
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
              <p className="eyebrow">AI 客户分析</p>
              {selectedContact.enrichment ? (
                <div className="sub-block">
                  <div className="row">
                    <span className={`smtp-${selectedContact.enrichment.status === 'done' ? 'success' : 'error'}`}>
                      {selectedContact.enrichment.status === 'done' ? '✓ 已完成' : selectedContact.enrichment.status === 'in_progress' ? '⏳ 分析中' : selectedContact.enrichment.status === 'failed' ? '✗ 失败' : '○ 待处理'}
                    </span>
                    <span className="hint">置信度: {(selectedContact.enrichment.confidence * 100).toFixed(0)}%</span>
                  </div>

                  {selectedContact.enrichment.companyName ? (
                    <p className="result"><strong>公司：</strong>{selectedContact.enrichment.companyName}</p>
                  ) : null}
                  {selectedContact.enrichment.industry ? (
                    <p className="result"><strong>行业：</strong>{selectedContact.enrichment.industry}</p>
                  ) : null}
                  {selectedContact.enrichment.mainProducts.length > 0 ? (
                    <p className="result"><strong>主营产品：</strong>{selectedContact.enrichment.mainProducts.join('、')}</p>
                  ) : null}
                  {selectedContact.enrichment.businessType && selectedContact.enrichment.businessType !== 'unknown' ? (
                    <p className="result"><strong>业务类型：</strong>{selectedContact.enrichment.businessType}</p>
                  ) : null}
                  {selectedContact.enrichment.targetMarkets.length > 0 ? (
                    <p className="result"><strong>目标市场：</strong>{selectedContact.enrichment.targetMarkets.join('、')}</p>
                  ) : null}
                  {selectedContact.enrichment.possibleNeeds.length > 0 ? (
                    <p className="result"><strong>潜在需求：</strong>{selectedContact.enrichment.possibleNeeds.join('；')}</p>
                  ) : null}
                  {selectedContact.enrichment.disqualifiedReasons.length > 0 ? (
                    <p className="result"><strong>排除原因：</strong>{selectedContact.enrichment.disqualifiedReasons.join('；')}</p>
                  ) : null}
                  {selectedContact.enrichment.errorMessage ? (
                    <p className="smtp-error">{selectedContact.enrichment.errorMessage}</p>
                  ) : null}
                  {selectedContact.enrichment.websiteUrl ? (
                    <p className="hint">网站：{selectedContact.enrichment.websiteUrl}</p>
                  ) : null}
                  {selectedContact.enrichment.enrichedAt ? (
                    <p className="hint">分析时间：{new Date(selectedContact.enrichment.enrichedAt).toLocaleString('zh-CN')}</p>
                  ) : null}
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
                  {enrichingContactId === selectedContact.id ? '分析中...' : (selectedContact.enrichment ? '重新分析' : '开始分析')}
                </button>
              </div>
              {enrichError ? <p className="smtp-error">{enrichError}</p> : null}
            </section>
          </>
        ) : null}

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
            <button
              type="button"
              className="btn"
              onClick={() => void handlePreviewFromTextarea()}
              disabled={isPreviewing}
            >
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
          <textarea
            className="import-textarea"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />

          {previewResult ? (
            <div className="sub-block">
              <p className="result">
                预览完成：有效 {previewResult.validRows}，无效 {previewResult.invalidRows}。
              </p>
              <p className="hint">
                候选 {previewResult.candidates.length} 条，
                错误 {previewResult.errors.length} 条。
                {previewResult.errors.length > visiblePreviewErrors.length
                  ? `（仅显示前 ${visiblePreviewErrors.length} 条）`
                  : ''}
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
              <p className="result">
                导入结果：插入 {commitResult.insertedRows}，跳过 {commitResult.skippedRows}。
              </p>
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
      </section>
    );
  }

  function renderSmtpDetail() {
    return (
      <section className="pane pane-detail">
        <SenderAccountsPanel />
      </section>
    );
  }

  function renderProductsDetail() {
    return (
      <section className="pane pane-detail">
        <ProductsPanel />
      </section>
    );
  }

  function renderReportDetail() {
    return (
      <section className="pane pane-detail report-detail">
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
      </section>
    );
  }

  const workspaceClassName = [
    'workspace',
    themeMode === 'dark' ? 'theme-dark' : '',
    activeView === 'messages' ? 'layout-messages' : '',
  ].join(' ').trim();

  return (
    <main className={workspaceClassName} style={messageLayoutStyle}>
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
          onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        >
          主题：{themeMode === 'dark' ? '暗黑' : '明亮'}
        </button>
      </aside>

      {activeView === 'messages' ? (
        <>
          <div
            className="pane-splitter"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(event) => handleStartDrag(0, event.clientX)}
          />

          <section className="pane pane-list">
            <header className="pane-header">
              <div>
                <h2>Messages</h2>
                <p className="pane-subtitle">Direct Mail Project</p>
              </div>
              <button className="ghost-btn" type="button">＋</button>
            </header>
            <div className="message-list">
              {MESSAGE_LIST.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`message-item ${item.id === activeMessageId ? 'active' : ''}`}
                  onClick={() => setActiveMessageId(item.id)}
                >
                  <span className="message-title">{item.title}</span>
                  <span className="message-date">{item.dateText}</span>
                </button>
              ))}
            </div>
          </section>

          <div
            className="pane-splitter"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(event) => handleStartDrag(1, event.clientX)}
          />

          <section className="pane pane-detail">{renderMessagesMain()}</section>

          <div
            className="pane-splitter"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(event) => handleStartDrag(2, event.clientX)}
          />

          {renderMessagesInspector()}
        </>
      ) : (
        <>
          <section className="pane pane-list">
            {activeView === 'contacts' ? (
              <>
                <header className="pane-header">
                  <div>
                    <h2>Contacts</h2>
                    <p className="pane-subtitle">联系人列表</p>
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
                    onChange={(event) =>
                      setContactQuery((prev) => ({ ...prev, keyword: event.target.value }))
                    }
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
                <div className="table-wrap">
                  <table className="contacts-table">
                    <thead>
                      <tr>
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
                          <td>{item.email}</td>
                          <td>{item.firstName ?? '-'}</td>
                          <td>{item.lastName ?? '-'}</td>
                          <td>{item.company ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  {isContactsLoading ? '加载中...' : `总数：${contactsTotal}`}
                </p>
              </>
            ) : activeView === 'smtp' ? (
              <>
                <header className="pane-header">
                  <div>
                    <h2>SMTP</h2>
                    <p className="pane-subtitle">发件账号管理</p>
                  </div>
                </header>
                <div className="panel">
                  <p className="eyebrow">账号池</p>
                  <p className="hint">
                    在这里管理多个发件账号，后续用于轮询发送和频率控制。
                  </p>
                </div>
              </>
            ) : activeView === 'products' ? (
              <>
                <header className="pane-header">
                  <div>
                    <h2>Products</h2>
                    <p className="pane-subtitle">产品库管理</p>
                  </div>
                </header>
                <div className="panel">
                  <p className="eyebrow">产品库</p>
                  <p className="hint">
                    导入产品资料后，AI 将用于匹配客户需求并推荐最合适的产品。
                  </p>
                </div>
              </>
            ) : (
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
            )}
          </section>

          {activeView === 'contacts'
            ? renderContactsDetail()
            : activeView === 'smtp'
              ? renderSmtpDetail()
              : activeView === 'products'
                ? renderProductsDetail()
                : renderReportDetail()}
        </>
      )}

      <details className="dev-tools">
        <summary>开发工具</summary>
        <p className="hint">最小闭环：app.ping</p>
        <button
          type="button"
          className="btn"
          onClick={() => void handlePing()}
          disabled={pingStatus === 'loading'}
        >
          {pingStatus === 'loading' ? '测试中...' : '测试 app.ping'}
        </button>
        <p className="result">{pingText}</p>
      </details>
    </main>
  );
}

export default App;
