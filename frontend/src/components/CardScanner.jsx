import { useState, useRef } from 'react'
import { Camera, Upload, X, Check, Loader2, RefreshCw, Plus, Eye, RotateCcw } from 'lucide-react'
import { recognizeCard, addToCollection, searchCards } from '../api/client'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings } from '../contexts/SettingsContext'
import toast from 'react-hot-toast'
import { CARD_VARIANTS, getDefaultVariant } from '../utils/cardVariants'
import { CardModal } from './CardItem'

const SLASH_NUMBER_RE = /(\d{1,4})\s*\/\s*\d{1,4}/
const CODE_NUMBER_RE = /\b([A-Za-z]{2,}\d*)\s+(\d{1,4})\b/

function bestOcrQuery(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/[^\w\s/'-]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 2)

  const slashNumber = SLASH_NUMBER_RE.exec(text)?.[1] || ''
  const codeNumber = CODE_NUMBER_RE.exec(text)
  const nameLine = lines.find(line => (
    /[A-Za-z]{3,}/.test(line)
    && !/\b(HP|TCG|TRAINER|ENERGY|BASIC|STAGE|ILLUS|WEAKNESS|RESISTANCE)\b/i.test(line)
    && !SLASH_NUMBER_RE.test(line)
  )) || ''

  if (codeNumber) {
    return {
      query: `${codeNumber[1]} ${codeNumber[2]}`,
      recognized: { name: nameLine || codeNumber[1], number: codeNumber[2] },
    }
  }

  if (nameLine && slashNumber) {
    return {
      query: nameLine,
      recognized: { name: nameLine, number: slashNumber },
    }
  }

  return {
    query: nameLine,
    recognized: { name: nameLine || 'Card text', number: slashNumber || null },
  }
}

async function recognizeWithLocalOcr(file) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const candidates = await createOcrCandidates(file)
    const textParts = []
    for (const candidate of candidates) {
      const { data } = await worker.recognize(candidate)
      if (data.text) textParts.push(data.text)
    }
    const { query, recognized } = bestOcrQuery(textParts.join('\n'))
    if (!query) throw new Error('Could not read enough text from the card. Try a brighter, closer photo.')

    const response = await searchCards({ name: query, page: 1, page_size: 12, lang: 'all' })
    const targetNumber = String(recognized.number || '').replace(/^0+/, '')
    const matches = (response.data?.data || [])
      .sort((a, b) => {
        if (!targetNumber) return 0
        const aNumber = String(a.number || a.localId || '').replace(/^0+/, '')
        const bNumber = String(b.number || b.localId || '').replace(/^0+/, '')
        return (aNumber === targetNumber ? 0 : 1) - (bNumber === targetNumber ? 0 : 1)
      })
      .slice(0, 8)
      .map(card => ({
        ...card,
        image: card.images_small,
        set_abbreviation: card.set_ref?.abbreviation || card.set_id,
        lang: 'en',
        _lang: 'en',
      }))

    return {
      recognized: { ...recognized, language: 'en' },
      matches,
    }
  } finally {
    await worker.terminate()
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = URL.createObjectURL(file)
  })
}

async function canvasToBlob(canvas) {
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

async function createOcrCrop(image, crop, maxWidth = 1200) {
  const scale = Math.min(1, maxWidth / crop.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width * scale))
  canvas.height = Math.max(1, Math.round(crop.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.filter = 'contrast(1.25) saturate(0.8) grayscale(1)'
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
  return await canvasToBlob(canvas)
}

async function createOcrCandidates(file) {
  const image = await loadImage(file)
  try {
    const w = image.naturalWidth || image.width
    const h = image.naturalHeight || image.height
    const crops = [
      { x: 0, y: 0, width: w, height: h },
      { x: 0, y: 0, width: w, height: h * 0.42 },
      { x: 0, y: h * 0.58, width: w, height: h * 0.34 },
      { x: w * 0.08, y: h * 0.05, width: w * 0.84, height: h * 0.32 },
    ]
    const blobs = await Promise.all(crops.map((crop) => createOcrCrop(image, crop)))
    return blobs.filter(Boolean)
  } finally {
    URL.revokeObjectURL(image.src)
  }
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms)
    }),
  ])
}

// ─── Add-to-Collection Modal für Scan-Ergebnis ──────────────────────────────
function ScanAddModal({ match, onClose, onAdded }) {
  const { t } = useSettings()
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState('NM')
  const [variant, setVariant] = useState(() => getDefaultVariant(match))
  const [purchasePrice, setPurchasePrice] = useState('')
  const [showBack, setShowBack] = useState(false)
  const [adding, setAdding] = useState(false)
  const queryClient = useQueryClient()
  const displayImage = showBack ? '/cardback.jpg' : match.image
  const attacks = Array.isArray(match.attacks) ? match.attacks : []

  const handleAdd = async () => {
    setAdding(true)
    try {
      await addToCollection({
        card_id: match.id,
        quantity,
        condition,
        variant: variant || null,
        lang: 'en',
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['collection'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${match.name} ${t('scanner.addedToCollection')}!`)
      onAdded && onAdded()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.detail || t('card.addFailed')
      toast.error(msg)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/80 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl md:rounded-2xl bg-bg-surface border-t md:border border-border overflow-y-auto max-h-[85dvh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>
        <div className="p-5">
          {/* Card Info */}
          <div className="flex items-start gap-3 mb-4">
            {displayImage && (
              <button
                type="button"
                onClick={() => setShowBack(value => !value)}
                className="relative w-20 flex-shrink-0"
                aria-label={showBack ? t('card.showFront') : t('card.showBack')}
              >
                <img src={displayImage} alt={showBack ? t('card.cardBack') : match.name}
                  className="w-full object-cover rounded-xl border border-white/10 shadow-xl" />
                <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <RotateCcw size={10} />
                  {showBack ? 'Front' : 'Back'}
                </span>
              </button>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base truncate">{match.name}</p>
              <p className="text-xs font-mono text-brand-red/80 font-semibold">{`${(match.set_abbreviation || '').toUpperCase()} ${match.number || ''}`.trim()}</p>
              {match.rarity && <p className="text-[11px] text-text-muted">{match.rarity}</p>}
              {(match.supertype || match.types || match.hp || match.artist) && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
                  {(match.supertype || match.types) && <span>{match.supertype}{match.types ? ` (${match.types.join(', ')})` : ''}</span>}
                  {match.hp && <span>HP {match.hp}</span>}
                  {match.artist && <span className="col-span-2 truncate">Artist: {match.artist}</span>}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 flex-shrink-0">
              <X size={18} />
            </button>
          </div>

          {attacks.length > 0 && (
            <div className="mb-4 rounded-xl border border-border bg-bg-card p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">{t('card.attacks')}</p>
              <div className="space-y-2">
                {attacks.slice(0, 2).map((attack, index) => (
                  <div key={`${attack.name || 'attack'}-${index}`} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white">{attack.name}</span>
                      {attack.damage && <span className="font-black text-brand-red">{attack.damage}</span>}
                    </div>
                    {attack.effect && <p className="mt-1 leading-5 text-text-secondary">{attack.effect}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {/* Quantity + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t('common.quantity')}</label>
                <input
                  type="number" min="1" value={quantity}
                  onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t('card.condition')}</label>
                <select value={condition} onChange={e => setCondition(e.target.value)} className="select">
                  {['Mint', 'NM', 'LP', 'MP', 'HP'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Variant */}
            <div>
              <label className="text-xs text-text-muted mb-1 block">✨ {t('card.variant')}</label>
              <select value={variant} onChange={e => setVariant(e.target.value)} className="select">
                <option value="">{t('variants.none')}</option>
                {CARD_VARIANTS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>


            {/* Purchase price */}
            <div>
              <label className="text-xs text-text-muted mb-1 block">{t('scanner.purchasePriceLabel')}</label>
              <input
                type="number" step="0.01" min="0"
                placeholder="z.B. 4.99"
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex-1 py-3 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all"
              style={{ background: adding ? '#555' : '#e3000b', boxShadow: adding ? 'none' : '0 0 16px rgba(227,0,11,0.3)' }}
            >
              {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {adding ? t('scanner.adding') : t('scanner.addToCollection')}
            </button>
            <button onClick={onClose} className="btn-ghost px-3">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CardScanner({ isOpen, onClose, onCardSelected }) {
  const [phase, setPhase] = useState('capture') // 'capture' | 'loading' | 'results'
  const [preview, setPreview] = useState(null)
  const [results, setResults] = useState(null)
  const [addModal, setAddModal] = useState(null) // match to show modal for
  const [selectedMatch, setSelectedMatch] = useState(null)
  const fileRef = useRef()
  const { t } = useSettings()

  if (!isOpen) return null

  const handleFile = async (file) => {
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setPhase('loading')
    try {
      const data = await recognizeCard(file)
      setResults(data)
      setPhase('results')
    } catch (e) {
      const code = e?.response?.data?.code
      if (code === 'SCANNER_NOT_CONFIGURED' || e?.response?.status === 503) {
        try {
          toast(t('scanner.localOcrFallback') || 'Trying local OCR on this device...')
          const data = await withTimeout(
            recognizeWithLocalOcr(file),
            25000,
            'Local text recognition took too long. Try smart search with the card name or printed number.'
          )
          setResults(data)
          setPhase('results')
          return
        } catch (ocrError) {
          toast.error(ocrError?.message || t('scanner.recognitionFailed'))
        }
      } else {
        const msg = e?.response?.data?.detail || t('scanner.recognitionFailed')
        toast.error(msg)
      }
      setPhase('capture')
      setPreview(null)
    }
  }

  const reset = () => {
    setPhase('capture')
    setPreview(null)
    setResults(null)
    setAddModal(null)
    setSelectedMatch(null)
  }

  const openMatchDetails = (match) => {
    setSelectedMatch({
      ...match,
      images_small: match.images_small || match.image,
      images_large: match.images_large || match.image,
      images: match.images || (match.image ? { small: match.image, large: match.image } : undefined),
      set_ref: match.set_ref || {
        name: match.set_name || match.set_abbreviation || match.set_id,
        abbreviation: match.set_abbreviation || match.set_id,
      },
      lang: match.lang || 'en',
      _lang: match._lang || match.lang || 'en',
      price_confidence: match.price_confidence || 'strong',
    })
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4 flex-shrink-0">
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-[0.2em]">{t('scanner.title')}</p>
          <h2 className="text-lg font-black text-white">{t('scanner.subtitle')}</h2>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <X size={18} className="text-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">

        {/* CAPTURE */}
        {phase === 'capture' && (
          <div className="flex flex-col items-center gap-5 pt-4">
            <div className="w-full max-w-xs aspect-[2.5/3.5] rounded-2xl flex flex-col items-center justify-center relative"
              style={{ border: '2px dashed rgba(227,0,11,0.4)', background: 'rgba(227,0,11,0.04)' }}>
              <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-brand-red rounded-tl" />
              <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-brand-red rounded-tr" />
              <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-brand-red rounded-bl" />
              <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-brand-red rounded-br" />
              <Camera size={40} className="text-brand-red opacity-40 mb-2" />
              <p className="text-xs text-text-muted text-center px-6">{t('scanner.alignCard')}</p>
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={e => handleFile(e.target.files?.[0])} />

            <button onClick={() => fileRef.current?.click()}
              className="w-full max-w-xs py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-3"
              style={{ background: '#e3000b', boxShadow: '0 0 24px rgba(227,0,11,0.35)' }}>
              <Camera size={20} /> {t('scanner.takePhoto')}
            </button>

            <button
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.removeAttribute('capture')
                  fileRef.current.click()
                }
              }}
              className="text-sm text-text-muted hover:text-text-secondary flex items-center gap-2 transition-colors">
              <Upload size={14} /> {t('scanner.uploadImage')}
            </button>

            <p className="text-[11px] text-text-muted text-center max-w-xs">
              {t('scanner.aiHint')}
            </p>
          </div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-6 pt-8">
            {preview && preview.startsWith("blob:") && (
              <img src={preview} className="w-40 aspect-[2.5/3.5] object-cover rounded-xl"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
            )}
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-brand-red animate-spin" />
              <p className="text-sm text-text-secondary font-medium">{t('scanner.recognizing')}</p>
              <p className="text-xs text-text-muted text-center">{t('scanner.analyzing')}</p>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {phase === 'results' && results && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mb-2">{t('scanner.detected')}</p>
              <p className="font-bold text-white text-lg">{results.recognized?.name || '—'}</p>
              {results.recognized?.number && (
                <p className="text-sm text-text-muted">Nr. {results.recognized.number}</p>
              )}
            </div>

            {results.matches?.length > 0 ? (
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mb-3">
                  {t('scanner.matches')} ({results.matches.length})
                </p>
                {/* Grid layout — like Sets overview */}
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                  {results.matches.map(match => {
                    // Format card ID as "SETCODE NUMBER", e.g. "OBF 125"
                    const setCode = (match.set_abbreviation || match.set?.id || (match.id || '').split('-')[0]).toUpperCase()
                    const localNum = match.localId || match.number || ''
                    const cardIdLabel = `${setCode} ${localNum}`.trim()
                    return (
                      <div key={match.id}
                        className="flex flex-col cursor-pointer group hover:shadow-glow transition-all duration-200 hover:rotate-1"
                        onClick={() => openMatchDetails(match)}
                      >
                        {/* Card image — full width, portrait aspect ratio — exact CardItem hover effect */}
                        <div className="relative w-full aspect-[2.5/3.5] overflow-hidden rounded-xl ring-1 ring-white/5 group-hover:ring-2 group-hover:ring-brand-red/30 transition-all duration-200">
                          {match.image
                            ? <img src={match.image} alt={match.name}
                                className="w-full h-full object-cover shadow-lg group-hover:scale-[1.02] transition-transform duration-300" />
                            : <div className="w-full h-full bg-bg-surface rounded-xl flex items-center justify-center">
                                <span className="text-[9px] text-text-muted text-center p-1">{match.name}</span>
                              </div>
                          }
                        {/* Hover overlay with details button */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-xl">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center"
                              style={{ background: '#e3000b', boxShadow: '0 0 12px rgba(227,0,11,0.5)' }}>
                              <Eye size={14} className="text-white" />
                            </div>
                          </div>
                        </div>

                        {/* Card info */}
                        <div className="pt-1 flex flex-col gap-0.5">
                          <p className="font-bold text-white text-[10px] leading-tight line-clamp-2">{match.name}</p>
                          {cardIdLabel && (
                            <p className="text-[9px] font-mono text-brand-red/80 font-semibold">{cardIdLabel}</p>
                          )}
                          {match.rarity && (
                            <p className="text-[9px] text-text-muted truncate">{match.rarity}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-2">
                <p className="text-text-muted text-sm">{t('scanner.noMatches')}</p>
                <p className="text-xs text-text-muted">{t('scanner.noMatchTip')}</p>
              </div>
            )}

            <button onClick={reset}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-text-muted hover:text-white transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <RefreshCw size={15} /> {t('scanner.scanAgain')}
            </button>
          </div>
        )}
      </div>

      {/* Shared card detail/add modal */}
      {selectedMatch && (
        <CardModal
          card={selectedMatch}
          onClose={() => setSelectedMatch(null)}
          defaultLang={selectedMatch._lang || 'en'}
        />
      )}
    </div>
  )
}
