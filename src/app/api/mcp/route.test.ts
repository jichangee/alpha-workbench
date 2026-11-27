import { describe, expect, it } from 'vitest'
import { POST } from './route'

describe('/api/mcp', () => {
  it('lists MCP tools via Streamable HTTP JSON-RPC', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    const toolNames = (json.result?.tools ?? []).map((t: { name: string }) => t.name)
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'list_strategies',
        'get_market_data',
        'run_backtest',
        'compare_portfolios',
      ]),
    )
  })

  it('calls list_strategies tool via MCP', async () => {
    const req = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_strategies',
          arguments: {},
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    const text = json.result?.content?.[0]?.text ?? ''
    expect(text).toContain('buy_hold')
    expect(text).toContain('sma_cross')
  })
})
