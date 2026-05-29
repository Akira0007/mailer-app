import { useEffect, useState } from 'react';
import type { Product, ProductImportRow } from '../../shared/types.js';

const SAMPLE_CSV = [
  'name,category,description,tags,sellingPoints,targetUseCases,url,isActive',
  'Wireless Sensor,IIoT,High-precision temp sensor,industrial,sensors,energy-efficient|long-range,factory monitoring|cold chain,https://example.com/sensor,true',
].join('\n');

function parseCsv(text: string): ProductImportRow[] {
  const lines = text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const header = lines[0].toLowerCase().split(',');
  const nameIdx = header.indexOf('name');
  const catIdx = header.indexOf('category');
  const descIdx = header.indexOf('description');
  const tagsIdx = header.indexOf('tags');
  const spIdx = header.indexOf('sellingpoints');
  const useIdx = header.indexOf('targetusecases');
  const urlIdx = header.indexOf('url');
  const activeIdx = header.indexOf('isactive');

  if (nameIdx < 0 || descIdx < 0) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const get = (idx: number) => (idx >= 0 ? cols[idx]?.trim() ?? '' : '');

    return {
      name: get(nameIdx),
      category: get(catIdx),
      description: get(descIdx),
      tags: get(tagsIdx),
      sellingPoints: get(spIdx),
      targetUseCases: get(useIdx),
      url: get(urlIdx),
      isActive: get(activeIdx) === 'true',
    };
  }).filter((row) => row.name.length > 0);
}

export default function ProductsPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [message, setMessage] = useState('');
  const [importing, setImporting] = useState(false);

  async function loadProducts() {
    setLoading(true);
    try {
      const result = await window.api.products.list();
      setProducts(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载产品失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void window.api.products.list().then((result) => {
      if (active) {
        setProducts(result);
        setLoading(false);
      }
    }).catch((error) => {
      if (active) {
        setMessage(error instanceof Error ? error.message : '加载产品失败');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleImport() {
    const rows = parseCsv(csvText);

    if (rows.length === 0) {
      setMessage('CSV 格式有误，请检查后重试。');
      return;
    }

    setImporting(true);
    setMessage('');
    try {
      const result = await window.api.products.importCsv(rows);
      setMessage(`导入成功：${result.inserted} 个产品`);
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">产品库</p>

      <div className="sub-block">
        <p className="sub-title">CSV 导入产品</p>
        <p className="hint">
          格式：name,category,description,tags,sellingPoints,targetUseCases,url,isActive
        </p>
        <p className="hint">
          tags 用逗号分隔，sellingPoints/targetUseCases 用竖线 | 分隔
        </p>
        <textarea
          className="import-textarea"
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          rows={8}
        />
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => void handleImport()}
            disabled={importing}
          >
            {importing ? '导入中...' : '导入产品'}
          </button>
        </div>
        {message ? <p className="hint">{message}</p> : null}
      </div>

      <div className="sub-block">
        <p className="sub-title">产品列表 ({products.length})</p>
        {loading ? (
          <p className="hint">加载中...</p>
        ) : products.length === 0 ? (
          <p className="hint">暂无产品，请先通过 CSV 导入。</p>
        ) : (
          <div className="table-wrap">
            <table className="contacts-table compact">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类目</th>
                  <th>标签</th>
                  <th>活跃</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.category}</td>
                    <td>{product.tags.join(', ')}</td>
                    <td>{product.isActive ? '是' : '否'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
