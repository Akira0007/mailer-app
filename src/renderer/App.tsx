import { useState } from 'react';

import './styles/App.css';

function formatPingResult(receivedAt: number) {
  return new Date(receivedAt).toLocaleString('zh-CN');
}

function App() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );
  const [resultText, setResultText] = useState('还没有测试过');

  async function handlePing() {
    setStatus('loading');

    try {
      const result = await window.api.app.ping();
      setResultText(
        `收到 ${result.message}，时间：${formatPingResult(result.receivedAt)}`,
      );
      setStatus('done');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '未知错误';
      setResultText(`调用失败：${message}`);
      setStatus('error');
    }
  }

  return (
    <main id="center">
      <section className="ping-card">
        <p className="eyebrow">最小闭环验证</p>
        <h1>app.ping</h1>
        <p className="lead">
          点击下面按钮，验证
          {' Renderer -> preload -> main -> Renderer '}
          这条链路是否通了。
        </p>

        <button
          type="button"
          className="counter"
          onClick={handlePing}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? '测试中...' : '测试 app.ping'}
        </button>

        <p className="result">{resultText}</p>
      </section>
    </main>
  );
}

export default App;
