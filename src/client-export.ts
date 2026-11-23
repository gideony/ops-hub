import type { Client } from './lib'

/**
 * Escapa uma célula CSV e sanitiza contra injeção de fórmulas no Excel (=, +, -, @).
 */
export function clientCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""'
  const str = String(value)
  const safe = /^[\s]*[=+\-@]/.test(str) ? `'${str}` : str
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * Monta o conteúdo CSV com todas as colunas de dados do cliente,
 * utilizando separador ';' e BOM UTF-8 (\uFEFF) para compatibilidade nativa com Excel no Brasil.
 */
export function buildClientsCsv(clients: Client[]): string {
  const headers = [
    'ID',
    'Nome / Nome Fantasia',
    'Razão Social',
    'Contato Principal',
    'E-mail Contato',
    'Telefone Contato',
    'Responsável Financeiro',
    'E-mail Financeiro',
    'WhatsApp Financeiro',
    'Dia / Data de Vencimento',
    'Observações Financeiras',
    'Links',
    'Itens de Integração',
    'Referências de Integração',
  ]

  const rows = clients.map(client => {
    const formattedLinks = (client.links || [])
      .map(item => (item.label ? `${item.label}: ${item.url}` : item.url))
      .filter(Boolean)
      .join(' | ')

    const formattedIntegrations = (client.integration_items || [])
      .map(item => (item.key ? `${item.key}: ${item.value}` : item.value))
      .filter(Boolean)
      .join(' | ')

    return [
      client.id,
      client.name,
      client.legal_name || '',
      client.contact_name || '',
      client.contact_email || '',
      client.contact_phone || '',
      client.financial_contact_name || '',
      client.financial_email || '',
      client.financial_whatsapp || '',
      client.financial_due_date || '',
      client.financial_notes || '',
      formattedLinks,
      formattedIntegrations,
      client.integration_references || '',
    ]
  })

  const lines = [headers, ...rows]
  return '\uFEFF' + lines.map(line => line.map(clientCsvCell).join(';')).join('\r\n')
}

/**
 * Dispara o download de arquivo CSV no navegador.
 */
export function downloadClientsCsv(clients: Client[], fileName?: string): boolean {
  if (!clients || clients.length === 0) return false
  const csv = buildClientsCsv(clients)
  const today = new Date().toISOString().slice(0, 10)
  const name = fileName || `opshub-clientes-${today}.csv`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
