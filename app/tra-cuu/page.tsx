'use client'

import { useState } from 'react'
import { Search, FileText, Download, CheckCircle, Clock, AlertCircle, Calendar, Building, User, Shield, ChevronDown, ChevronUp, Loader2, ArrowLeft, Package } from 'lucide-react'
import Link from 'next/link'
import { PIPELINE_STAGES, SERVICE_TYPES, DOCUMENT_CATEGORIES } from '@/lib/types'
import type { PipelineStage, ServiceType, DocumentCategory } from '@/lib/types'

interface ServiceResult {
  id: string
  service_type: ServiceType
  product_name: string
  product_description: string | null
  current_stage: PipelineStage
  fda_code: string | null
  fda_issue_date: string | null
  fda_expiry_date: string | null
  fda_duns_code: string | null
  fda_fei_code: string | null
  us_agent_name: string | null
  us_agent_start_date: string | null
  us_agent_expiry_date: string | null
  client_name: string | null
  created_at: string
  updated_at: string
}

interface DocumentResult {
  id: string
  document_type: string
  category: DocumentCategory | null
  file_name: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  stage: PipelineStage | null
  created_at: string
}

interface ActivityResult {
  id: string
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

interface SearchResult {
  service: ServiceResult
  documents: DocumentResult[]
  activities: ActivityResult[]
}

export default function TraCuuPage() {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [showActivities, setShowActivities] = useState(false)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!code.trim() || !email.trim()) {
      setError('Vui lòng nhập đầy đủ mã số FDA và email')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(
        `/api/tra-cuu?code=${encodeURIComponent(code.trim())}&email=${encodeURIComponent(email.trim())}`
      )
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Đã có lỗi xảy ra')
        return
      }

      setResult(data)
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async (doc: DocumentResult) => {
    setDownloadingFile(doc.id)
    try {
      const response = await fetch(
        `/api/tra-cuu/file?pathname=${encodeURIComponent(doc.file_url)}&code=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`
      )

      if (!response.ok) {
        throw new Error('Không thể tải file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch {
      alert('Không thể tải file. Vui lòng thử lại sau.')
    } finally {
      setDownloadingFile(null)
    }
  }

  const getStageLabel = (stage: PipelineStage) => {
    return PIPELINE_STAGES.find(s => s.value === stage)?.label || stage
  }

  const getServiceTypeLabel = (type: ServiceType) => {
    return SERVICE_TYPES.find(t => t.value === type)?.label || type
  }

  const getCategoryLabel = (category: DocumentCategory | null) => {
    if (!category) return 'Khác'
    return DOCUMENT_CATEGORIES.find(c => c.value === category)?.label || 'Khác'
  }

  const formatDate = (date: string | null) => {
    if (!date) return '---'
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getStageProgress = (stage: PipelineStage) => {
    const index = PIPELINE_STAGES.findIndex(s => s.value === stage)
    return ((index + 1) / PIPELINE_STAGES.length) * 100
  }

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'stage_updated': 'Cập nhật trạng thái',
      'document_uploaded': 'Tải lên tài liệu',
      'service_created': 'Tạo hồ sơ',
      'task_completed': 'Hoàn thành công việc',
    }
    return labels[action] || action
  }

  const isExpired = (date: string | null) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  const isExpiringSoon = (date: string | null, days: number = 30) => {
    if (!date) return false
    const expiryDate = new Date(date)
    const warningDate = new Date()
    warningDate.setDate(warningDate.getDate() + days)
    return expiryDate <= warningDate && expiryDate > new Date()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Trang chủ</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-semibold text-slate-900">Vexim Global</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Tra cứu hồ sơ FDA
          </h1>
          <p className="text-slate-600">
            Nhập mã số FDA và email đã đăng ký để xem thông tin hồ sơ của bạn
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1.5">
                Mã số FDA
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Nhập mã số FDA"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email đã đăng ký
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Nhập email của bạn"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Đang tìm kiếm...</span>
              </>
            ) : (
              <>
                <Search className="h-5 w-5" />
                <span>Tra cứu</span>
              </>
            )}
          </button>
        </form>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Service Info Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-1">
                      {result.service.product_name}
                    </h2>
                    <span className="inline-block px-2 py-0.5 bg-white/20 rounded text-sm text-white/90">
                      {getServiceTypeLabel(result.service.service_type)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-white/80 text-sm">Mã FDA</div>
                    <div className="text-white font-mono font-semibold">
                      {result.service.fda_code || '---'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Tiến độ hồ sơ</span>
                  <span className="text-sm text-emerald-600 font-medium">
                    {getStageLabel(result.service.current_stage)}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${getStageProgress(result.service.current_stage)}%` }}
                  />
                </div>
              </div>

              {/* Info Grid */}
              <div className="p-6 grid gap-4 md:grid-cols-2">
                {/* FDA Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    Thông tin FDA
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">DUNS Code</span>
                      <span className="font-medium text-slate-900 font-mono">
                        {result.service.fda_duns_code || '---'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">FEI Code</span>
                      <span className="font-medium text-slate-900 font-mono">
                        {result.service.fda_fei_code || '---'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">Ngày cấp</span>
                      <span className="font-medium text-slate-900">
                        {formatDate(result.service.fda_issue_date)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-600">Ngày hết hạn</span>
                      <span className={`font-medium ${
                        isExpired(result.service.fda_expiry_date) 
                          ? 'text-red-600' 
                          : isExpiringSoon(result.service.fda_expiry_date) 
                            ? 'text-amber-600' 
                            : 'text-slate-900'
                      }`}>
                        {formatDate(result.service.fda_expiry_date)}
                        {isExpired(result.service.fda_expiry_date) && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            Hết hạn
                          </span>
                        )}
                        {isExpiringSoon(result.service.fda_expiry_date) && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            Sắp hết hạn
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* US Agent Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-500" />
                    Thông tin US Agent
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">Tên US Agent</span>
                      <span className="font-medium text-slate-900">
                        {result.service.us_agent_name || '---'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">Ngày bắt đầu</span>
                      <span className="font-medium text-slate-900">
                        {formatDate(result.service.us_agent_start_date)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-600">Ngày hết hạn</span>
                      <span className={`font-medium ${
                        isExpired(result.service.us_agent_expiry_date) 
                          ? 'text-red-600' 
                          : isExpiringSoon(result.service.us_agent_expiry_date) 
                            ? 'text-amber-600' 
                            : 'text-slate-900'
                      }`}>
                        {formatDate(result.service.us_agent_expiry_date)}
                        {isExpired(result.service.us_agent_expiry_date) && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            Hết hạn
                          </span>
                        )}
                        {isExpiringSoon(result.service.us_agent_expiry_date) && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            Sắp hết hạn
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="md:col-span-2 pt-4 border-t border-slate-100">
                  <div className="flex flex-wrap gap-6 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      <span>Khách hàng: <strong className="text-slate-900">{result.service.client_name || '---'}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Ngày tạo: <strong className="text-slate-900">{formatDate(result.service.created_at)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>Cập nhật: <strong className="text-slate-900">{formatDate(result.service.updated_at)}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Documents */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  Tài liệu kết quả
                </h3>
                <span className="text-sm text-slate-500">
                  {result.documents.length} tài liệu
                </span>
              </div>

              {result.documents.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {result.documents.map((doc) => (
                    <div key={doc.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {doc.file_name}
                          </div>
                          <div className="text-sm text-slate-500 flex items-center gap-2">
                            <span>{getCategoryLabel(doc.category)}</span>
                            {doc.file_size && (
                              <>
                                <span className="text-slate-300">|</span>
                                <span>{formatFileSize(doc.file_size)}</span>
                              </>
                            )}
                            <span className="text-slate-300">|</span>
                            <span>{formatDate(doc.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingFile === doc.id}
                        className="ml-4 flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {downloadingFile === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        <span className="text-sm font-medium">Tải về</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center text-slate-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>Chưa có tài liệu kết quả nào</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Tài liệu sẽ được cập nhật khi hồ sơ hoàn tất
                  </p>
                </div>
              )}
            </div>

            {/* Activity Log */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowActivities(!showActivities)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-emerald-500" />
                  Lịch sử cập nhật
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">
                    {result.activities.length} hoạt động
                  </span>
                  {showActivities ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </div>
              </button>

              {showActivities && result.activities.length > 0 && (
                <div className="px-6 pb-4">
                  <div className="space-y-3">
                    {result.activities.map((activity) => (
                      <div key={activity.id} className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-900">
                            {getActionLabel(activity.action)}
                            {activity.details?.new_stage && (
                              <span className="text-emerald-600">
                                {' '}&#8594; {getStageLabel(activity.details.new_stage as PipelineStage)}
                              </span>
                            )}
                          </div>
                          {activity.details?.note && (
                            <p className="text-sm text-slate-600 mt-1">
                              {String(activity.details.note)}
                            </p>
                          )}
                          <div className="text-xs text-slate-400 mt-1">
                            {formatDateTime(activity.created_at)}
                            {activity.details?.staff_name && (
                              <span> - {String(activity.details.staff_name)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showActivities && result.activities.length === 0 && (
                <div className="px-6 pb-6 text-center text-slate-500">
                  <p className="text-sm">Chưa có lịch sử cập nhật</p>
                </div>
              )}
            </div>

            {/* Help Section */}
            <div className="bg-slate-50 rounded-xl p-6 text-center">
              <p className="text-slate-600 mb-2">
                Cần hỗ trợ? Liên hệ với chúng tôi
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a href="mailto:support@vexim.vn" className="text-emerald-600 hover:text-emerald-700 font-medium">
                  support@vexim.vn
                </a>
                <span className="text-slate-300">|</span>
                <a href="tel:1900xxxx" className="text-emerald-600 hover:text-emerald-700 font-medium">
                  1900 xxxx
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && !isLoading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 mb-4">
              <Search className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              Tra cứu thông tin hồ sơ FDA
            </h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Nhập mã số FDA và email đã đăng ký để xem tiến độ, thông tin chi tiết và tải về các tài liệu liên quan.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Vexim Global. Tất cả quyền được bảo lưu.</p>
        </div>
      </footer>
    </div>
  )
}
