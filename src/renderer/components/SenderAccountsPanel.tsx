import { useState, useEffect } from 'react';
import type {
  SendSingleEmailInput,
  SendSingleEmailResult,
  SenderAccountCreateInput,
  SenderAccountView,
  TestConnectionResult,
} from '../../shared/types.js';
import { SMTP_DEFAULTS, SMTP_PORTS } from '../../shared/constants.js';

function emptyForm(): SenderAccountCreateInput {
  return {
    name: '',
    email: '',
    host: '',
    port: SMTP_DEFAULTS.port,
    username: '',
    password: '',
    useTls: SMTP_DEFAULTS.useTls,
  };
}

export default function SenderAccountsPanel() {
  const [accounts, setAccounts] = useState<SenderAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<SenderAccountCreateInput>(emptyForm());
  const [singleSendForm, setSingleSendForm] = useState<SendSingleEmailInput>({
    accountId: '',
    to: '',
    subject: '',
    body: '',
  });
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [sendResult, setSendResult] = useState<SendSingleEmailResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function syncSingleSendAccount(nextAccounts: SenderAccountView[]) {
    setSingleSendForm((prev) => {
      if (nextAccounts.length === 0) {
        if (prev.accountId.length === 0) {
          return prev;
        }
        return { ...prev, accountId: '' };
      }

      if (prev.accountId && nextAccounts.some((account) => account.id === prev.accountId)) {
        return prev;
      }

      return {
        ...prev,
        accountId: nextAccounts[0].id,
      };
    });
  }

  async function loadAccounts() {
    setLoading(true);
    try {
      const result = await window.api.smtpAccounts.list();
      setAccounts(result);
      syncSingleSendAccount(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void window.api.smtpAccounts.list().then((result) => {
      if (!active) {
        return;
      }

      setAccounts(result);
      syncSingleSendAccount(result);
      setLoading(false);
    }).catch((error) => {
      if (!active) {
        return;
      }

      setMessage(error instanceof Error ? error.message : '加载账号失败');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof SenderAccountCreateInput>(
    key: K,
    value: SenderAccountCreateInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.api.smtpAccounts.testConnection({
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password,
        useTls: form.useTls,
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await window.api.smtpAccounts.create(form);
      setMessage('账号已添加');
      setForm(emptyForm());
      setTestResult(null);
      setSendResult(null);
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await window.api.smtpAccounts.delete(id);
      setSendResult(null);
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    }
  }

  function updateSingleSendField<K extends keyof SendSingleEmailInput>(
    key: K,
    value: SendSingleEmailInput[K],
  ) {
    setSingleSendForm((prev) => ({ ...prev, [key]: value }));
    setSendResult(null);
  }

  async function handleSendSingleEmail() {
    setSending(true);
    setSendResult(null);
    setMessage('');
    try {
      const result = await window.api.smtpAccounts.sendSingle(singleSendForm);
      setSendResult(result);
      setMessage('单封邮件发送完成。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发送失败');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">SMTP 发件账号</p>

      <div className="sub-block">
        <p className="sub-title">添加账号</p>
        <div className="smtp-form">
          <div className="smtp-form-row">
            <input
              className="text-input"
              placeholder="名称（如 Gmail、QQ 邮箱）"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
            <input
              className="text-input"
              placeholder="发件邮箱"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
            />
          </div>
          <div className="smtp-form-row">
            <input
              className="text-input"
              placeholder="SMTP 服务器"
              value={form.host}
              onChange={(e) => updateField('host', e.target.value)}
            />
            <select
              className="text-input smtp-port-select"
              value={form.port}
              onChange={(e) => updateField('port', Number(e.target.value))}
            >
              {SMTP_PORTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label className="smtp-tls-label">
              <input
                type="checkbox"
                checked={form.useTls}
                onChange={(e) => updateField('useTls', e.target.checked)}
              />
              TLS
            </label>
          </div>
          <div className="smtp-form-row">
            <input
              className="text-input"
              placeholder="用户名"
              value={form.username}
              onChange={(e) => updateField('username', e.target.value)}
            />
            <input
              className="text-input"
              type="password"
              placeholder="密码"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={handleSave}
              disabled={saving || !form.host || !form.username || !form.password}
            >
              {saving ? '保存中...' : '保存账号'}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={handleTestConnection}
              disabled={testing || !form.host || !form.port}
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
          </div>
          {testResult ? (
            <p className={`hint ${testResult.ok ? 'smtp-success' : 'smtp-error'}`}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
            </p>
          ) : null}
          {message ? <p className="hint">{message}</p> : null}
        </div>
      </div>

      <div className="sub-block">
        <p className="sub-title">已保存账号 ({accounts.length})</p>
        {loading ? (
          <p className="hint">加载中...</p>
        ) : accounts.length === 0 ? (
          <p className="hint">暂无账号</p>
        ) : (
          <div className="table-wrap">
            <table className="contacts-table compact">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>邮箱</th>
                  <th>服务器</th>
                  <th>端口</th>
                  <th>TLS</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>{acc.name}</td>
                    <td>{acc.email}</td>
                    <td>{acc.host}</td>
                    <td>{acc.port}</td>
                    <td>{acc.useTls ? '是' : '否'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary btn-small"
                        onClick={() => handleDelete(acc.id)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sub-block">
        <p className="sub-title">发送单封邮件（当前闭环）</p>
        <div className="smtp-form">
          <div className="smtp-form-row">
            <select
              className="text-input"
              value={singleSendForm.accountId}
              onChange={(event) => updateSingleSendField('accountId', event.target.value)}
              disabled={accounts.length === 0}
            >
              {accounts.length === 0 ? (
                <option value="">暂无可用发件账号</option>
              ) : (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.email})
                  </option>
                ))
              )}
            </select>
            <input
              className="text-input"
              placeholder="收件人邮箱"
              value={singleSendForm.to}
              onChange={(event) => updateSingleSendField('to', event.target.value)}
            />
          </div>
          <div className="smtp-form-row">
            <input
              className="text-input"
              placeholder="邮件主题"
              value={singleSendForm.subject}
              onChange={(event) => updateSingleSendField('subject', event.target.value)}
            />
          </div>
          <div className="smtp-form-row smtp-form-row-column">
            <textarea
              className="import-textarea smtp-body-textarea"
              placeholder="邮件正文（纯文本）"
              value={singleSendForm.body}
              onChange={(event) => updateSingleSendField('body', event.target.value)}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => void handleSendSingleEmail()}
              disabled={
                sending
                || accounts.length === 0
                || singleSendForm.accountId.trim().length === 0
                || singleSendForm.to.trim().length === 0
                || singleSendForm.subject.trim().length === 0
                || singleSendForm.body.trim().length === 0
              }
            >
              {sending ? '发送中...' : '发送单封'}
            </button>
          </div>
          {sendResult ? (
            <p className={`hint ${sendResult.ok ? 'smtp-success' : 'smtp-error'}`}>
              {sendResult.ok ? '✓ ' : '✗ '}
              accepted={sendResult.acceptedCount} rejected={sendResult.rejectedCount}
              {sendResult.messageId ? ` messageId=${sendResult.messageId}` : ''}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
