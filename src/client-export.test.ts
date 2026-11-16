import { describe, expect, it } from 'vitest'
import type { Client } from './lib'
import { buildClientsCsv, clientCsvCell } from './client-export'

describe('Exportação de Clientes em CSV (Todas as Colunas)', () => {
  const sampleClients: Client[] = [
    {
      id: 'client-1',
      name: 'Aurora Café',
      legal_name: 'Aurora Café Comércio Ltda.',
      contact_name: 'Marina Lopes',
      contact_email: 'marina@aurora.example',
      contact_phone: '(11) 90000-0101',
      financial_contact_name: 'Paulo Lima',
      financial_email: 'financeiro@aurora.example',
      financial_whatsapp: '(11) 90000-0102',
      financial_due_date: 'Todo dia 10',
      financial_notes: 'Faturamento via boleto e NF emitida no dia 5.',
      links: [
        { label: 'Site Oficial', url: 'https://aurora.example' },
        { label: 'Portal B2B', url: 'https://b2b.aurora.example' },
      ],
      integration_references: 'ERP Bling ID 4920',
      integration_items: [
        { key: 'Webhook URL', value: 'https://aurora.example/webhook' },
        { key: 'Token de Consulta', value: 'token-publico-123' },
      ],
    },
    {
      id: 'client-2',
      name: 'Verdejar "Paisagismo"',
      legal_name: null,
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      financial_contact_name: null,
      financial_email: null,
      financial_whatsapp: null,
      financial_due_date: null,
      financial_notes: null,
      links: [],
      integration_references: null,
      integration_items: [],
    },
  ]

  it('deve sanitizar células contra injeção de fórmulas no Excel (=, +, -, @)', () => {
    expect(clientCsvCell('=1+1')).toBe('"\'=1+1"')
    expect(clientCsvCell('+cmd')).toBe('"\'+cmd"')
    expect(clientCsvCell('-100')).toBe('"\'-100"')
    expect(clientCsvCell('@sum')).toBe('"\'@sum"')
    expect(clientCsvCell('Texto Normal')).toBe('"Texto Normal"')
    expect(clientCsvCell(null)).toBe('""')
    expect(clientCsvCell(undefined)).toBe('""')
  })

  it('deve escapar aspas duplas corretamente', () => {
    expect(clientCsvCell('Empresa "Top"')).toBe('"Empresa ""Top"""')
  })

  it('deve gerar cabeçalho completo com todas as 14 colunas', () => {
    const csv = buildClientsCsv(sampleClients)
    expect(csv.startsWith('\uFEFF')).toBe(true)

    const expectedHeader = [
      '"ID"',
      '"Nome / Nome Fantasia"',
      '"Razão Social"',
      '"Contato Principal"',
      '"E-mail Contato"',
      '"Telefone Contato"',
      '"Responsável Financeiro"',
      '"E-mail Financeiro"',
      '"WhatsApp Financeiro"',
      '"Dia / Data de Vencimento"',
      '"Observações Financeiras"',
      '"Links"',
      '"Itens de Integração"',
      '"Referências de Integração"',
    ].join(';')

    expect(csv).toContain(expectedHeader)
  })

  it('deve preencher todas as colunas com dados estruturados e links formatados', () => {
    const csv = buildClientsCsv(sampleClients)
    expect(csv).toContain('"Aurora Café"')
    expect(csv).toContain('"Aurora Café Comércio Ltda."')
    expect(csv).toContain('"Marina Lopes"')
    expect(csv).toContain('"marina@aurora.example"')
    expect(csv).toContain('"(11) 90000-0101"')
    expect(csv).toContain('"Paulo Lima"')
    expect(csv).toContain('"financeiro@aurora.example"')
    expect(csv).toContain('"Todo dia 10"')
    expect(csv).toContain('"Site Oficial: https://aurora.example | Portal B2B: https://b2b.aurora.example"')
    expect(csv).toContain('"Webhook URL: https://aurora.example/webhook | Token de Consulta: token-publico-123"')
    expect(csv).toContain('"ERP Bling ID 4920"')
  })

  it('deve tratar campos nulos e aspas duplas no nome do cliente com segurança', () => {
    const csv = buildClientsCsv(sampleClients)
    expect(csv).toContain('"Verdejar ""Paisagismo"""')
  })

  it('deve gerar apenas o cabeçalho se a lista estiver vazia', () => {
    const csv = buildClientsCsv([])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1)
  })
})
