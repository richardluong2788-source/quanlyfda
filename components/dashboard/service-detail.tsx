'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { 
  PIPELINE_STAGES, 
  getServiceTypeLabel,
  getStageIndex,
  getDocumentCategoryLabel,
  type Service,
  type PipelineTask,
  type PipelineStage,
  type Document,
} from '@/lib/types'
import {
  Utensils,
  Sparkles,
  Stethoscope,
  User,
  FileText,
  Download,
  Upload,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building2,
  Shield,
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  MoreVertical,
} from 'lucide-react'
import Link from 'next/link'
import { getNextFdaRenewalDate, isFdaRenewalFree, fdaRenewalCountdown } from '@/lib/fda-utils'
import { UploadDocumentDialog } from './upload-document-dialog'
import { RenewalRequestDialog } from './renewal-request-dialog'
import { CreateTaskDialog } from './create-task-dialog'
import { deleteTask, getProfile } from '@/app/actions/services'
import { StageTransitionDialog } from './stage-transition-dialog'
import type { Profile } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function getServiceIcon(type: string) {
  switch (type) {
    case 'food':
      return <Utensils className="h-5 w-5" />
    case 'cosmetics':
      return <Sparkles className="h-5 w-5" />
    case 'medical_device':
      return <Stethoscope className="h-5 w-5" />
    default:
      return null
  }
}

function getServiceTypeBadgeClass(type: string) {
  switch (type) {
    case 'food':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'cosmetics':
      return 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30'
    case 'medical_device':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function getDaysUntilExpiry(dateStr: string): number {
  const expiryDate = new Date(dateStr)
  const today = new Date()
  const diffTime = expiryDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function getExpiryStatus(days: number): 'expired' | 'critical' | 'warning' | 'normal' {
  if (days <= 0) return 'expired'
  if (days <= 30) return 'critical'
  if (days <= 90) return 'warning'
  return 'normal'
}

interface ServiceDetailProps {
  serviceId: string
}

export function ServiceDetail({ serviceId }: ServiceDetailProps) {
  const [service, setService] = useState<Service | null>(null)
  const [tasks, setTasks] = useState<PipelineTask[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [showRenewalRequest, setShowRenewalRequest] = useState(false)
  const [userProfile, setUserProfile] = useState<Profile | null>(null)
  const [stageTransitionOpen, setStageTransitionOpen] = useState(false)
  const [targetStage, setTargetStage] = useState<PipelineStage | null>(null)

  const isStaffOrAdmin = userProfile?.role === 'admin' || userProfile?.role === 'staff'

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      // Fetch user profile
      try {
        const profile = await getProfile()
        setUserProfile(profile)
      } catch (error) {
        console.error('[v0] Error fetching profile:', error)
      }
      
      // Fetch service
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select(`
          *,
          client:profiles!services_client_id_fkey(*),
          assigned_staff:profiles!services_assigned_staff_id_fkey(*)
        `)
        .eq('id', serviceId)
        .single()

      if (serviceError) {
        console.error('[v0] Error fetching service:', serviceError)
        setIsLoading(false)
        return
      }

      setService(serviceData as Service)

      // Fetch tasks
      const { data: tasksData } = await supabase
        .from('pipeline_tasks')
        .select('*')
        .eq('service_id', serviceId)
        .order('stage')
        .order('sort_order')

      if (tasksData) {
        setTasks(tasksData as PipelineTask[])
      }

      // Fetch documents
      const { data: docsData } = await supabase
        .from('documents')
        .select(`
          *,
          uploader:profiles!documents_uploaded_by_fkey(*)
        `)
        .eq('service_id', serviceId)
        .order('created_at', { ascending: false })

      if (docsData) {
        setDocuments(docsData as Document[])
      }

      setIsLoading(false)
    }

    fetchData()
  }, [serviceId])

  const toggleTask = async (taskId: string, isCompleted: boolean) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase
      .from('pipeline_tasks')
      .update({
        is_completed: !isCompleted,
        completed_at: !isCompleted ? new Date().toISOString() : null,
        completed_by: !isCompleted ? user?.id : null
      })
      .eq('id', taskId)

    if (!error) {
      setTasks(prev =>
        prev.map(t => t.id === taskId ? { ...t, is_completed: !isCompleted } : t)
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!service) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <p>Không tìm thấy dịch vụ</p>
        <Link href="/dashboard/service">
          <Button variant="link" className="mt-2">Quay lại danh sách dịch vụ</Button>
        </Link>
      </div>
    )
  }

  const currentStageIndex = getStageIndex(service.current_stage)
  const currentStage = PIPELINE_STAGES[currentStageIndex]
  const completedTasks = tasks.filter(t => t.is_completed).length
  const totalTasks = tasks.length
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const fdaDaysUntilExpiry = service.fda_expiry_date ? getDaysUntilExpiry(service.fda_expiry_date) : null
  const fdaExpiryStatus = fdaDaysUntilExpiry !== null ? getExpiryStatus(fdaDaysUntilExpiry) : null

  const agentDaysUntilExpiry = service.us_agent_expiry_date ? getDaysUntilExpiry(service.us_agent_expiry_date) : null
  const agentExpiryStatus = agentDaysUntilExpiry !== null ? getExpiryStatus(agentDaysUntilExpiry) : null

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link href="/dashboard/service">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách dịch vụ
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={`${getServiceTypeBadgeClass(service.service_type)}`}
            >
              {getServiceIcon(service.service_type)}
              <span className="ml-1">{getServiceTypeLabel(service.service_type)}</span>
            </Badge>
            <Badge variant="secondary">
              Giai đoạn {currentStageIndex + 1}/7
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{service.product_name}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              <span>{service.client?.company_name || service.client?.full_name || 'N/A'}</span>
            </div>
            {service.assigned_staff && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>Phụ trách: {service.assigned_staff.full_name || 'Staff'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => {
              // Open contact support dialog or navigate to support page
              window.location.href = '/dashboard/support'
            }}
          >
            Liên hệ hỗ trợ
          </Button>
          {isStaffOrAdmin && (
            <Button
              onClick={() => {
                // Navigate to edit service page or open edit dialog
                window.location.href = `/dashboard/service/${serviceId}/edit`
              }}
            >
              Cập nhật thông tin
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline Progress */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Tiến độ Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Progress Line */}
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(currentStageIndex / 6) * 100}%` }}
              />
            </div>

            {/* Stages */}
            <div className="relative flex justify-between">
              {PIPELINE_STAGES.map((stage, index) => {
                const isCompleted = currentStageIndex > index
                const isCurrent = currentStageIndex === index
                const isClickable = isStaffOrAdmin && index !== currentStageIndex

                return (
                  <div
                    key={stage.value}
                    className="flex flex-col items-center"
                    onClick={() => {
                      if (isClickable) {
                        setTargetStage(stage.value)
                        setStageTransitionOpen(true)
                      }
                    }}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                        isClickable ? 'cursor-pointer hover:shadow-md hover:border-primary/60' : ''
                      } ${
                        isCompleted
                          ? 'bg-primary border-primary text-primary-foreground'
                          : isCurrent
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs text-center max-w-[80px] ${
                        isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'
                      } ${isClickable ? 'cursor-pointer hover:text-primary' : ''}`}
                    >
                      {stage.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Details & Checklist */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="checklist" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="documents">Tài liệu</TabsTrigger>
              <TabsTrigger value="history">Lịch sử</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="mt-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">Checklist công việc</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {completedTasks}/{totalTasks} ho��n thành
                      </span>
                      {isStaffOrAdmin && (
                        <CreateTaskDialog
                          serviceId={serviceId}
                          currentStage={service.current_stage}
                          onTaskCreated={(newTask) => {
                            setTasks(prev => [...prev, newTask])
                          }}
                          trigger={
                            <Button variant="outline" size="sm" className="gap-1">
                              <Plus className="h-4 w-4" />
                              Thêm
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </div>
                  <Progress value={progress} className="h-2" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Chưa có checklist</p>
                      {isStaffOrAdmin && (
                        <p className="text-xs mt-2">Nhấn &quot;Thêm&quot; để tạo công việc mới</p>
                      )}
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          task.is_completed ? 'bg-success/10' : 'bg-secondary'
                        }`}
                      >
                        <div 
                          className="flex items-center gap-3 flex-1 cursor-pointer"
                          onClick={() => toggleTask(task.id, task.is_completed)}
                        >
                          <Checkbox
                            checked={task.is_completed}
                            className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                          />
                          <div className="flex-1">
                            <span
                              className={`text-sm ${
                                task.is_completed
                                  ? 'text-muted-foreground line-through'
                                  : 'text-foreground'
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                            )}
                          </div>
                        </div>
                        {isStaffOrAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <CreateTaskDialog
                                serviceId={serviceId}
                                currentStage={service.current_stage}
                                task={task}
                                onTaskUpdated={(updatedTask) => {
                                  setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t))
                                }}
                                trigger={
                                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    Sửa
                                  </DropdownMenuItem>
                                }
                              />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={async () => {
                                  if (confirm('Bạn có chắc muốn xóa công việc này?')) {
                                    try {
                                      await deleteTask(task.id)
                                      setTasks(prev => prev.filter(t => t.id !== task.id))
                                    } catch (error) {
                                      console.error('[v0] Error deleting task:', error)
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Xóa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">Tài liệu</CardTitle>
                    {isStaffOrAdmin && (
                      <UploadDocumentDialog 
                        serviceId={serviceId} 
                        serviceName={service.product_name}
                        onUploadComplete={() => {
                          // Refetch documents
                          const fetchDocs = async () => {
                            const supabase = createClient()
                            const { data: docsData } = await supabase
                              .from('documents')
                              .select(`*, uploader:profiles!documents_uploaded_by_fkey(*)`)
                              .eq('service_id', serviceId)
                              .order('created_at', { ascending: false })
                            if (docsData) setDocuments(docsData as Document[])
                          }
                          fetchDocs()
                        }}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Chưa có tài liệu nào</p>
                    </div>
                  ) : (
                    documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{doc.file_name}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                Tải lên: {formatDate(doc.created_at)}
                              </p>
                              {doc.category && (
                                <Badge variant="outline" className="text-xs">
                                  {getDocumentCategoryLabel(doc.category)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const isNewDocument = new Date(doc.created_at).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)
                            return (
                              <Badge 
                                variant={doc.document_type === 'result' ? 'default' : 'secondary'}
                                className={isNewDocument && doc.document_type === 'result' ? 'ring-2 ring-green-500/50 animate-pulse' : ''}
                              >
                                {doc.document_type === 'result' ? 'Kết quả' : 'Yêu cầu'}
                                {isNewDocument && doc.document_type === 'result' && ' - Mới'}
                              </Badge>
                            )
                          })()}
                          {doc.file_url && (
                            <Button variant="ghost" size="icon" asChild title="Tải xuống">
                              <a
                                href={`${doc.file_url}${doc.file_url.includes('?') ? '&' : '?'}download=1`}
                                download={doc.file_name}
                                rel="noopener noreferrer"
                              >
                                <Download className="h-4 w-4" />
                                <span className="sr-only">Tải xuống {doc.file_name}</span>
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Lịch sử hoạt động</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <div className="w-0.5 flex-1 bg-border" />
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium text-foreground">Cập nhật trạng thái</p>
                        <p className="text-xs text-muted-foreground">
                          Chuyển sang giai đoạn &quot;{currentStage?.label}&quot;
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(service.updated_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-muted" />
                        <div className="w-0.5 flex-1 bg-border" />
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium text-foreground">Tiếp nhận yêu cầu</p>
                        <p className="text-xs text-muted-foreground">
                          Đã tiếp nhận và bắt đầu xử lý
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(service.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - Info Cards */}
        <div className="space-y-6">
          {/* FDA Registration Info */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Thông tin FDA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {service.fda_code ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Mã đăng ký FDA</p>
                    <p className="font-mono text-sm text-primary">{service.fda_code}</p>
                  </div>
                  {service.fda_duns_code && (
                    <div>
                      <p className="text-xs text-muted-foreground">Mã DUNS</p>
                      <p className="font-mono text-sm text-foreground">{service.fda_duns_code}</p>
                    </div>
                  )}
                  {service.fda_fei_code && (
                    <div>
                      <p className="text-xs text-muted-foreground">Mã FEI</p>
                      <p className="font-mono text-sm text-foreground">{service.fda_fei_code}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày cấp</p>
                    <p className="text-sm text-foreground">
                      {formatDate(service.fda_issue_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày hết hạn (đã nhập)</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground">
                        {formatDate(service.fda_expiry_date)}
                      </p>
                      {fdaExpiryStatus && fdaExpiryStatus !== 'normal' && (
                        <Badge
                          variant={fdaExpiryStatus === 'expired' || fdaExpiryStatus === 'critical' ? 'destructive' : 'secondary'}
                          className={fdaExpiryStatus === 'warning' ? 'bg-warning text-warning-foreground' : ''}
                        >
                          {fdaExpiryStatus === 'expired'
                            ? 'Đã hết hạn'
                            : `${fdaDaysUntilExpiry} ngày`}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* FDA Renewal section - based on even-year rule */}
                  {service.fda_issue_date && (() => {
                    const nextRenewal = getNextFdaRenewalDate(service.fda_issue_date)
                    const countdown = fdaRenewalCountdown(service.fda_issue_date)
                    const isFree = isFdaRenewalFree(service.us_agent_expiry_date)
                    return (
                      <div className="pt-2 border-t border-border space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Gia hạn FDA tiếp theo</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm text-foreground">
                              {nextRenewal.toLocaleDateString('vi-VN')}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {countdown}
                            </Badge>
                          </div>
                        </div>
                        {isFree && (
                          <div className="flex items-center gap-2 bg-primary/10 rounded-md px-3 py-2">
                            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                            <p className="text-xs text-primary font-medium">
                              Gia hạn FDA miễn phí - US Agent còn hiệu lực
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chưa có mã FDA</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* US Agent Info */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Thông tin US Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {service.us_agent_name ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Tên US Agent</p>
                    <p className="text-sm text-foreground">{service.us_agent_name}</p>
                  </div>
                  {service.us_agent_start_date && (
                    <div>
                      <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
                      <p className="text-sm text-foreground">{formatDate(service.us_agent_start_date)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày hết hạn</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground">
                        {formatDate(service.us_agent_expiry_date)}
                      </p>
                      {agentExpiryStatus && agentExpiryStatus !== 'normal' && (
                        <Badge
                          variant={agentExpiryStatus === 'expired' || agentExpiryStatus === 'critical' ? 'destructive' : 'secondary'}
                          className={agentExpiryStatus === 'warning' ? 'bg-warning text-warning-foreground' : ''}
                        >
                          {agentExpiryStatus === 'expired'
                            ? 'Đã hết hạn'
                            : `${agentDaysUntilExpiry} ngày`}
                        </Badge>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chưa xác nhận US Agent</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Thao tác nhanh</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Upload button - only for staff/admin */}
              {isStaffOrAdmin && (
                <UploadDocumentDialog
                  serviceId={serviceId}
                  serviceName={service?.product_name}
                  open={uploadOpen}
                  onOpenChange={setUploadOpen}
                  trigger={
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2"
                      onClick={() => setUploadOpen(true)}
                    >
                      <Upload className="h-4 w-4" />
                      Tải lên tài liệu
                    </Button>
                  }
                  onUploadComplete={() => {
                    // Refresh documents
                    const fetchDocs = async () => {
                      const supabase = createClient()
                      const { data: docsData } = await supabase
                        .from('documents')
                        .select('*')
                        .eq('service_id', serviceId)
                        .order('created_at', { ascending: false })
                      if (docsData) setDocuments(docsData)
                    }
                    fetchDocs()
                    setUploadOpen(false)
                  }}
                />
              )}
              
              {/* Download FDA Certificate - find result document */}
              {(() => {
                const fdaCertificate = documents.find(d => d.document_type === 'result')
                if (fdaCertificate && fdaCertificate.file_url) {
                  return (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2"
                      asChild
                    >
                      <a
                        href={`${fdaCertificate.file_url}${fdaCertificate.file_url.includes('?') ? '&' : '?'}download=1`}
                        download={fdaCertificate.file_name}
                        rel="noopener noreferrer"
                      >
                        <Download className="h-4 w-4" />
                        Tải chứng nhận FDA
                      </a>
                    </Button>
                  )
                }
                return (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                    disabled
                  >
                    <Clock className="h-4 w-4" />
                    Chưa có chứng nhận FDA
                  </Button>
                )
              })()}

              <Button 
                variant="outline" 
                className="w-full justify-start gap-2"
                onClick={() => setShowRenewalRequest(true)}
              >
                <AlertTriangle className="h-4 w-4" />
                Yêu cầu gia hạn
              </Button>
              <RenewalRequestDialog
                open={showRenewalRequest}
                onOpenChange={setShowRenewalRequest}
                serviceId={serviceId}
                productName={service?.product_name || 'Dịch vụ'}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stage Transition Dialog */}
      {service && targetStage && (
        <StageTransitionDialog
          open={stageTransitionOpen}
          onOpenChange={setStageTransitionOpen}
          serviceId={serviceId}
          currentStage={service.current_stage}
          targetStage={targetStage}
          productName={service.product_name}
          onSuccess={() => {
            // Reload service data
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
