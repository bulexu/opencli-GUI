import { useMemo, useState, useEffect } from 'react'
import Papa from 'papaparse'
import { saveCsvDialog } from '../services/opencli'

interface Props {
  result: { success: boolean; data?: string; error?: string; exitCode: number }
  columns: string[]
  filename: string
}

const PAGE_SIZE = 100

export default function ResultTable({ result, columns, filename }: Props) {
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [parseWarning, setParseWarning] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!result.data) return []
    const parsed = Papa.parse<Record<string, string>>(result.data, {
      header: true,
      skipEmptyLines: true,
    })
    if (parsed.errors.length > 0) {
      setParseWarning(`CSV 解析有 ${parsed.errors.length} 个警告，部分数据可能不完整`)
    } else {
      setParseWarning(null)
    }
    return parsed.data
  }, [result.data])

  const headers = useMemo(() => {
    if (rows.length === 0) return columns
    // Union of all row keys to handle merged batch results with different schemas
    const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    return allKeys
  }, [rows, columns])

  const filteredRows = useMemo(() => {
    if (!filter.trim()) return rows
    const q = filter.toLowerCase()
    return rows.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(q))
    )
  }, [rows, filter])

  // Reset page when filtered data shrinks below current page
  useEffect(() => {
    const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE)
    if (page >= totalPages && totalPages > 0) {
      setPage(totalPages - 1)
    }
  }, [filteredRows.length, page])

  const sortedRows = useMemo(() => {
    if (!sortCol) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const va = a[sortCol] ?? ''
      const vb = b[sortCol] ?? ''
      const numA = Number(va)
      const numB = Number(vb)
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortAsc ? numA - numB : numB - numA
      }
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [filteredRows, sortCol, sortAsc])

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const pageRows = sortedRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(col)
      setSortAsc(true)
    }
    setPage(0)
  }

  const handleExportCsv = async () => {
    const csv = Papa.unparse(filteredRows)
    await saveCsvDialog(`${filename}.csv`, csv)
  }

  if (!result.success || !result.data) return null

  return (
    <div className="result-table">
      {parseWarning && <div className="parse-warning">{parseWarning}</div>}
      <div className="result-toolbar">
        <span className="result-count">{filteredRows.length} 条结果</span>
        <input
          type="text"
          className="filter-input"
          placeholder="筛选..."
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0) }}
        />
        <button className="export-btn" onClick={handleExportCsv}>导出 CSV</button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} onClick={() => handleSort(h)} className={sortCol === h ? (sortAsc ? 'sort-asc' : 'sort-desc') : ''}>
                  {h}
                  {sortCol === h && <span className="sort-icon">{sortAsc ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={safePage * PAGE_SIZE + i}>
                {headers.map((h) => (
                  <td key={h} title={row[h]}>{row[h]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>上一页</button>
          <span>第 {safePage + 1} / {totalPages} 页</span>
          <button disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}
