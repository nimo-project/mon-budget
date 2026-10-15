// Lecture des relevés exportés par les banques (CSV ou OFX).
// Les colonnes sont reconnues par leur nom ; si la reconnaissance échoue,
// l'écran d'import propose de choisir les colonnes à la main (ColumnMapping).

import { parseDate, parseMoney } from '../domain/util'

export interface ParsedRow {
  date: string
  label: string
  amount: number
  /** Identifiant fourni par la banque (OFX), le plus fiable pour les doublons. */
  externalId?: string
}

export interface ColumnMapping {
  headerRow: number
  date: number
  label: number
  /** Colonne complémentaire ajoutée au libellé (ex. « Détail de l'écriture » chez SG). */
  detail?: number
  amount?: number
  debit?: number
  credit?: number
  fee?: number
  state?: number
}

export interface ParseResult {
  rows: ParsedRow[]
  bank?: 'boursobank' | 'sg' | 'revolut'
  /** Lignes brutes et colonnes détectées, pour l'écran de correspondance manuelle. */
  table?: string[][]
  mapping?: ColumnMapping
  skipped: number
}

export function decode(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  // Exports en Windows-1252 (fréquent pour les CSV des banques françaises)
  return new TextDecoder('windows-1252').decode(bytes)
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field.trim() === '') {
      quoted = true
      field = ''
    } else if (c === d) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()))
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()))
  return rows
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n')
  const counts = [';', ',', '\t'].map((d) => [d, sample.split(d).length] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][0]
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const ALIASES = {
  date: ['dateop', 'date operation', 'date de l operation', 'completed date', 'date de fin', 'date comptable', 'date', 'started date', 'date de debut', 'date de valeur', 'dateval'],
  label: ['label', 'libelle', 'libelle simplifie', 'description', 'libelle operation', 'intitule', 'nom'],
  detail: ['detail de l ecriture', 'libelle complementaire', 'informations complementaires'],
  amount: ['amount', 'montant', 'montant de l operation', 'montant eur', 'montant euros'],
  debit: ['debit', 'debit euros', 'debit eur'],
  credit: ['credit', 'credit euros', 'credit eur'],
  fee: ['fee', 'frais'],
  state: ['state', 'etat', 'statut'],
}

function findColumn(header: string[], aliases: string[]): number | undefined {
  const h = header.map(norm)
  for (const a of aliases) {
    const i = h.indexOf(a)
    if (i >= 0) return i
  }
  return undefined
}

export function detectMapping(table: string[][]): ColumnMapping | undefined {
  for (let r = 0; r < Math.min(table.length, 20); r++) {
    const header = table[r]
    const date = findColumn(header, ALIASES.date)
    const label = findColumn(header, ALIASES.label)
    const amount = findColumn(header, ALIASES.amount)
    const debit = findColumn(header, ALIASES.debit)
    const credit = findColumn(header, ALIASES.credit)
    if (date === undefined || label === undefined) continue
    if (amount === undefined && (debit === undefined || credit === undefined)) continue
    return {
      headerRow: r,
      date,
      label,
      detail: findColumn(header, ALIASES.detail),
      amount,
      debit: amount === undefined ? debit : undefined,
      credit: amount === undefined ? credit : undefined,
      fee: findColumn(header, ALIASES.fee),
      state: findColumn(header, ALIASES.state),
    }
  }
  return undefined
}

function detectBank(table: string[][], mapping: ColumnMapping): ParseResult['bank'] {
  const header = table[mapping.headerRow].map(norm)
  if (header.includes('dateop') || header.includes('supplierfound') || header.includes('accountbalance')) return 'boursobank'
  if (header.includes('completed date') || header.includes('product') || header.includes('produit')) return 'revolut'
  if (header.includes('detail de l ecriture') || header.includes('montant de l operation')) return 'sg'
  return undefined
}

const DONE_STATES = ['completed', 'termine', 'terminee', 'effectue', 'effectuee']

export function applyMapping(table: string[][], m: ColumnMapping): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = []
  let skipped = 0
  for (const line of table.slice(m.headerRow + 1)) {
    const date = parseDate(line[m.date] ?? '')
    let amount: number | null
    if (m.amount !== undefined) amount = parseMoney(line[m.amount] ?? '')
    else {
      const debit = parseMoney(line[m.debit!] ?? '') ?? 0
      const credit = parseMoney(line[m.credit!] ?? '') ?? 0
      amount = credit - Math.abs(debit)
      if (!line[m.debit!] && !line[m.credit!]) amount = null
    }
    if (m.state !== undefined && line[m.state] && !DONE_STATES.includes(norm(line[m.state]))) {
      skipped++
      continue
    }
    if (amount !== null && m.fee !== undefined) amount -= Math.abs(parseMoney(line[m.fee] ?? '') ?? 0)
    const parts = [line[m.label], m.detail !== undefined ? line[m.detail] : ''].filter((s) => s && s.trim())
    const label = [...new Set(parts)].join(' — ').replace(/\s+/g, ' ').trim()
    if (!date || amount === null || !label) {
      skipped++
      continue
    }
    rows.push({ date, label, amount })
  }
  return { rows, skipped }
}

export function parseOfx(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  const tag = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))
    return m ? m[1].trim() : ''
  }
  for (const b of blocks) {
    const date = parseDate(tag(b, 'DTPOSTED'))
    const amount = parseMoney(tag(b, 'TRNAMT'))
    const name = tag(b, 'NAME')
    const memo = tag(b, 'MEMO')
    const label = [...new Set([name, memo].filter(Boolean))].join(' — ')
    if (!date || amount === null || !label) continue
    rows.push({ date, label, amount, externalId: tag(b, 'FITID') || undefined })
  }
  return rows
}

export function parseStatement(fileName: string, bytes: ArrayBuffer): ParseResult {
  const text = decode(bytes)
  if (/\.(ofx|qfx)$/i.test(fileName) || /<OFX>/i.test(text)) {
    return { rows: parseOfx(text), skipped: 0 }
  }
  const table = parseCsv(text)
  const mapping = detectMapping(table)
  if (!mapping) return { rows: [], table, skipped: 0 }
  const { rows, skipped } = applyMapping(table, mapping)
  return { rows, table, mapping, skipped, bank: detectBank(table, mapping) }
}
