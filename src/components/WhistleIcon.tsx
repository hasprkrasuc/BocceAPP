/**
 * Ikona piščalke — oznaka glavnega sodnika tekme.
 *
 * Deljena, ker jo uporabljata ligaški razpored in pokalni pajek. Kot kopija v
 * obeh datotekah bi se ob prvi spremembi razšla, oznaka sodnika pa bi na eni
 * strani izgledala drugače kot na drugi.
 */
export default function WhistleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 8a1 1 0 0 1 1-1h8.2l3.8-2.4V9.1A6 6 0 1 1 9.3 16H4a1 1 0 0 1-1-1V8zm7 3.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z" />
    </svg>
  )
}
