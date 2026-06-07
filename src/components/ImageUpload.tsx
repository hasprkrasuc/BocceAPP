import { useState } from 'react'
import { supabase } from '../supabase'

interface Props {
  bucket: string
  path: string
  currentUrl: string | null | undefined
  onUpload: (url: string) => void
  label?: string
  shape?: 'square' | 'round' | 'wide'
}

export default function ImageUpload({
  bucket, path, currentUrl, onUpload,
  label = 'Naloži sliko', shape = 'square',
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${path}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
      onUpload(data.publicUrl)
    } catch (err) {
      setError((err as Error).message)
    }
    setUploading(false)
  }

  const previewClass =
    shape === 'round'
      ? 'w-20 h-20 rounded-full object-cover'
      : shape === 'wide'
      ? 'w-40 h-24 rounded-lg object-cover'
      : 'w-20 h-20 rounded-lg object-cover'

  const placeholderClass =
    shape === 'round'
      ? 'w-20 h-20 rounded-full'
      : shape === 'wide'
      ? 'w-40 h-24 rounded-lg'
      : 'w-20 h-20 rounded-lg'

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-4">
        {currentUrl ? (
          <img src={currentUrl} alt="preview" className={`${previewClass} bg-gray-100 border border-gray-200`} />
        ) : (
          <div className={`${placeholderClass} bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl`}>
            {shape === 'round' ? '👤' : '🖼️'}
          </div>
        )}
        <div className="space-y-1">
          <label className="cursor-pointer inline-block bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            {uploading ? 'Nalagam...' : 'Izberi datoteko'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
          </label>
          {currentUrl && (
            <p className="text-xs text-green-600">✓ Slika naložena</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
