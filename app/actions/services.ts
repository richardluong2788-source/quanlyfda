'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Service, Profile, PipelineStage, ServiceType } from '@/lib/types'
import { getStageLabel } from '@/lib/types'

// Helper to get current user
async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('Unauthorized')
  }
  return user
}

// Helper to get user profile with role
async function getCurrentProfile() {
  const user = await getCurrentUser()
  const supabase = await createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  
  if (error || !profile) {
    throw new Error('Profile not found')
  }
  return profile as Profile
}

// Get all services (with role-based filtering via RLS)
export async function getServices() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      client:profiles!services_client_id_fkey(*),
      assigned_staff:profiles!services_assigned_staff_id_fkey(*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v0] Error fetching services:', error)
    return []
  }
  return data as Service[]
}

const SERVICE_SELECT = `
  *,
  client:profiles!services_client_id_fkey(*),
  assigned_staff:profiles!services_assigned_staff_id_fkey(*)
`

// Fetch a single Kanban column's services with server-side pagination + an exact
// total count. Used by the board so we only ever transfer a small batch per
// column instead of every service for every client.
export async function getPipelineServices(params: {
  stage: PipelineStage
  serviceTypes?: ServiceType[]
  limit?: number
  offset?: number
}): Promise<{ services: Service[]; total: number }> {
  const supabase = await createClient()
  const { stage, serviceTypes, limit = 15, offset = 0 } = params

  let query = supabase
    .from('services')
    .select(SERVICE_SELECT, { count: 'exact' })
    .eq('current_stage', stage)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Only constrain by type when a real subset is selected.
  if (serviceTypes && serviceTypes.length > 0 && serviceTypes.length < 3) {
    query = query.in('service_type', serviceTypes)
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[v0] Error fetching pipeline services:', error)
    return { services: [], total: 0 }
  }
  return { services: (data ?? []) as Service[], total: count ?? 0 }
}

// Lightweight count-only query for a stage (used for terminal columns where we
// show a tally instead of a card list).
export async function getStageCount(
  stage: PipelineStage,
  serviceTypes?: ServiceType[],
): Promise<number> {
  const supabase = await createClient()
  let query = supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('current_stage', stage)

  if (serviceTypes && serviceTypes.length > 0 && serviceTypes.length < 3) {
    query = query.in('service_type', serviceTypes)
  }

  const { count, error } = await query
  if (error) {
    console.error('[v0] Error counting stage services:', error)
    return 0
  }
  return count ?? 0
}

// Paginated + searchable list of services for the archive/completed table.
// Accepts one or more stages (e.g. the terminal stages) plus optional filters.
export async function getArchivedServices(params: {
  stages: PipelineStage[]
  serviceTypes?: ServiceType[]
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ services: Service[]; total: number }> {
  const supabase = await createClient()
  const { stages, serviceTypes, search, page = 1, pageSize = 20 } = params

  if (!stages.length) return { services: [], total: 0 }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('services')
    .select(SERVICE_SELECT, { count: 'exact' })
    .in('current_stage', stages)
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (serviceTypes && serviceTypes.length > 0 && serviceTypes.length < 3) {
    query = query.in('service_type', serviceTypes)
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    // Match product name or FDA code.
    query = query.or(`product_name.ilike.${term},fda_code.ilike.${term}`)
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[v0] Error fetching archived services:', error)
    return { services: [], total: 0 }
  }
  return { services: (data ?? []) as Service[], total: count ?? 0 }
}

// Get single service by ID
export async function getServiceById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      client:profiles!services_client_id_fkey(*),
      assigned_staff:profiles!services_assigned_staff_id_fkey(*),
      tasks:pipeline_tasks(*),
      documents(*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[v0] Error fetching service:', error)
    return null
  }
  return data as Service
}

// Create new service (staff/admin only)
export async function createService(data: {
  client_id: string
  service_type: ServiceType
  product_name: string
  product_description?: string
}) {
  const profile = await getCurrentProfile()
  
  // Only admin and staff can create services
  if (profile.role !== 'admin' && profile.role !== 'staff') {
    throw new Error('Unauthorized: Only admin and staff can create services')
  }
  
  const supabase = await createClient()
  
  const { data: service, error } = await supabase
    .from('services')
    .insert(data)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error creating service:', error)
    throw new Error('Failed to create service')
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/pipeline')
  return service as Service
}

// FDA Info for completion stage
interface FdaInfo {
  fda_code: string
  fda_issue_date: string
  fda_expiry_date: string
  fda_duns_code: string
  fda_fei_code: string
}

// US Agent Info for us_agent_confirmation stage
interface UsAgentInfo {
  us_agent_name: string
  us_agent_start_date: string
  us_agent_expiry_date: string
}

// Update service stage
export async function updateServiceStage(
  serviceId: string, 
  stage: PipelineStage, 
  note?: string,
  fdaInfo?: FdaInfo,
  usAgentInfo?: UsAgentInfo
) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  
  // Get current service info
  const { data: currentService, error: fetchError } = await supabase
    .from('services')
    .select(`
      *,
      client:profiles!services_client_id_fkey(email, full_name)
    `)
    .eq('id', serviceId)
    .single()

  if (fetchError || !currentService) {
    console.error('[v0] Error fetching service:', fetchError)
    throw new Error('Service not found')
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    current_stage: stage,
    updated_at: new Date().toISOString()
  }

  // Add FDA info if provided (for completion_handover stage)
  if (fdaInfo && stage === 'completion_handover') {
    updatePayload.fda_code = fdaInfo.fda_code
    updatePayload.fda_issue_date = fdaInfo.fda_issue_date
    updatePayload.fda_expiry_date = fdaInfo.fda_expiry_date
    updatePayload.fda_duns_code = fdaInfo.fda_duns_code
    updatePayload.fda_fei_code = fdaInfo.fda_fei_code
  }

  // Add US Agent info if provided (for us_agent_confirmation stage)
  if (usAgentInfo && stage === 'us_agent_confirmation') {
    updatePayload.us_agent_name = usAgentInfo.us_agent_name
    updatePayload.us_agent_start_date = usAgentInfo.us_agent_start_date
    updatePayload.us_agent_expiry_date = usAgentInfo.us_agent_expiry_date
  }

  const { error } = await supabase
    .from('services')
    .update(updatePayload)
    .eq('id', serviceId)

  if (error) {
    console.error('[v0] Error updating service stage:', error)
    throw new Error('Failed to update service stage')
  }

  // Get current user profile for logging
  const currentProfile = await getCurrentProfile()

  // Log activity with note, FDA info and US Agent info
  await supabase.from('activity_logs').insert({
    service_id: serviceId,
    user_id: user.id,
    action: 'stage_updated',
    details: { 
      new_stage: stage,
      note: note || null,
      staff_name: currentProfile.full_name || currentProfile.email,
      fda_info: fdaInfo || null,
      us_agent_info: usAgentInfo || null
    }
  })

  // Send email to client if email is configured
  try {
    const { sendEmail, emailTemplates } = await import('@/lib/email')
    
    if (currentService.client?.email) {
      // Use the single source of truth for stage labels (lib/types) so the
      // email shows friendly Vietnamese names instead of raw stage codes.
      const fromStage = getStageLabel(currentService.current_stage)
      const toStage = getStageLabel(stage)

      const emailTemplate = emailTemplates.serviceStageChanged(
        currentService.product_name,
        fromStage,
        toStage,
        note,
        fdaInfo,
        usAgentInfo
      )

      await sendEmail({
        to: currentService.client.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
      })
    }
  } catch (emailError) {
    console.error('[v0] Error sending stage change email:', emailError)
    // Don't throw - email is not critical, continue with the update
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/service')
  revalidatePath(`/dashboard/service/${serviceId}`)
}

// Update service details
export async function updateService(serviceId: string, data: Partial<Service>) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('services')
    .update({
      ...data,
      updated_at: new Date().toISOString()
    })
    .eq('id', serviceId)

  if (error) {
    console.error('[v0] Error updating service:', error)
    throw new Error('Failed to update service')
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/service/${serviceId}`)
}

// Get pipeline tasks for a service
export async function getServiceTasks(serviceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pipeline_tasks')
    .select('*')
    .eq('service_id', serviceId)
    .order('stage')
    .order('sort_order')

  if (error) {
    console.error('[v0] Error fetching tasks:', error)
    return []
  }
  return data
}

// Toggle task completion
export async function toggleTask(taskId: string, isCompleted: boolean) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  
  const { error } = await supabase
    .from('pipeline_tasks')
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      completed_by: isCompleted ? user.id : null
    })
    .eq('id', taskId)

  if (error) {
    console.error('[v0] Error toggling task:', error)
    throw new Error('Failed to update task')
  }

  revalidatePath('/dashboard')
}

// Create task
export async function createTask(data: {
  service_id: string
  stage: PipelineStage
  title: string
  description?: string
  sort_order?: number
}) {
  const profile = await getCurrentProfile()
  
  // Only admin and staff can create tasks
  if (profile.role !== 'admin' && profile.role !== 'staff') {
    throw new Error('Unauthorized: Only admin and staff can create tasks')
  }
  
  const supabase = await createClient()
  
  // Get the max sort_order for this service and stage
  const { data: existingTasks } = await supabase
    .from('pipeline_tasks')
    .select('sort_order')
    .eq('service_id', data.service_id)
    .eq('stage', data.stage)
    .order('sort_order', { ascending: false })
    .limit(1)
  
  const nextSortOrder = existingTasks && existingTasks.length > 0 
    ? (existingTasks[0].sort_order || 0) + 1 
    : 1
  
  const { data: task, error } = await supabase
    .from('pipeline_tasks')
    .insert({
      ...data,
      sort_order: data.sort_order ?? nextSortOrder
    })
    .select()
    .single()

  if (error) {
    console.error('[v0] Error creating task:', error)
    throw new Error('Failed to create task')
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/service/${data.service_id}`)
  return task
}

// Update task
export async function updateTask(taskId: string, data: {
  title?: string
  description?: string
  stage?: PipelineStage
  sort_order?: number
}) {
  const profile = await getCurrentProfile()
  
  // Only admin and staff can update tasks
  if (profile.role !== 'admin' && profile.role !== 'staff') {
    throw new Error('Unauthorized: Only admin and staff can update tasks')
  }
  
  const supabase = await createClient()
  
  const { data: task, error } = await supabase
    .from('pipeline_tasks')
    .update(data)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error updating task:', error)
    throw new Error('Failed to update task')
  }

  revalidatePath('/dashboard')
  return task
}

// Delete task
export async function deleteTask(taskId: string) {
  const profile = await getCurrentProfile()
  
  // Only admin and staff can delete tasks
  if (profile.role !== 'admin' && profile.role !== 'staff') {
    throw new Error('Unauthorized: Only admin and staff can delete tasks')
  }
  
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('pipeline_tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    console.error('[v0] Error deleting task:', error)
    throw new Error('Failed to delete task')
  }

  revalidatePath('/dashboard')
}

export async function getServiceDocuments(serviceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select(`
      *,
      uploader:profiles!documents_uploaded_by_fkey(*)
    `)
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v0] Error fetching documents:', error)
    return []
  }
  return data
}

// Get all documents (for documents page)
export async function getAllDocuments() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select(`
      *,
      uploader:profiles!documents_uploaded_by_fkey(*),
      service:services(*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v0] Error fetching documents:', error)
    return []
  }
  return data
}

// Get notifications
export async function getNotifications() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      service:services(id, product_name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v0] Error fetching notifications:', error)
    return []
  }
  return data
}

// Mark notification as read
export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString()
    })
    .eq('id', notificationId)

  if (error) {
    console.error('[v0] Error marking notification read:', error)
    throw new Error('Failed to update notification')
  }

  revalidatePath('/dashboard/notifications')
}

// Mark all notifications as read
export async function markAllNotificationsRead() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  
  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString()
    })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (error) {
    console.error('[v0] Error marking all notifications read:', error)
    throw new Error('Failed to update notifications')
  }

  revalidatePath('/dashboard/notifications')
}

// Delete notification
export async function deleteNotification(notificationId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  if (error) {
    console.error('[v0] Error deleting notification:', error)
    throw new Error('Failed to delete notification')
  }

  revalidatePath('/dashboard/notifications')
}

// Get user profile
export async function getProfile() {
  return getCurrentProfile()
}

// Update profile
export async function updateProfile(data: Partial<Profile>) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  
  const { error } = await supabase
    .from('profiles')
    .update({
      ...data,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (error) {
    console.error('[v0] Error updating profile:', error)
    throw new Error('Failed to update profile')
  }

  revalidatePath('/dashboard/settings')
}

// Get notification settings
export async function getNotificationSettings() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('[v0] Error fetching notification settings:', error)
    return null
  }
  return data
}

// Update notification settings
export async function updateNotificationSettings(data: {
  email_service_updates?: boolean
  email_document_requests?: boolean
  email_renewal_reminders?: boolean
  reminder_days_before?: number
}) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  
  const { error } = await supabase
    .from('notification_settings')
    .update({
      ...data,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', user.id)

  if (error) {
    console.error('[v0] Error updating notification settings:', error)
    throw new Error('Failed to update settings')
  }

  revalidatePath('/dashboard/settings')
}

// Get services with expiring FDA or US Agent
export async function getExpiringServices(daysAhead: number = 30) {
  const supabase = await createClient()
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + daysAhead)
  
  const { data, error } = await supabase
    .from('services')
    .select(`
      *,
      client:profiles!services_client_id_fkey(*)
    `)
    .or(`fda_expiry_date.lte.${futureDate.toISOString()},us_agent_expiry_date.lte.${futureDate.toISOString()}`)
    .not('fda_expiry_date', 'is', null)
    .order('fda_expiry_date', { ascending: true })

  if (error) {
    console.error('[v0] Error fetching expiring services:', error)
    return []
  }
  return data as Service[]
}

// Get dashboard stats
export async function getDashboardStats() {
  const supabase = await createClient()
  const profile = await getCurrentProfile()
  
  // Get total services count
  const { count: totalServices } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
  
  // Get completed services count
  const { count: completedServices } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('current_stage', 'completion_handover')
  
  // Get unread notifications count
  const { count: unreadNotifications } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)
  
  // Get expiring services count (next 30 days)
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 30)
  const { count: expiringCount } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .or(`fda_expiry_date.lte.${futureDate.toISOString()},us_agent_expiry_date.lte.${futureDate.toISOString()}`)
    .not('fda_expiry_date', 'is', null)

  return {
    totalServices: totalServices || 0,
    completedServices: completedServices || 0,
    unreadNotifications: unreadNotifications || 0,
    expiringCount: expiringCount || 0,
    userRole: profile.role
  }
}

// Get all clients (for admin/staff)
export async function getClients() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('company_name')

  if (error) {
    console.error('[v0] Error fetching clients:', error)
    return []
  }
  return data as Profile[]
}

// Get all staff members (for admin)
export async function getStaffMembers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['staff', 'admin'])
    .order('full_name')

  if (error) {
    console.error('[v0] Error fetching staff:', error)
    return []
  }
  return data as Profile[]
}

// App base URL used for the password-setup redirect.
function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://quanlyfda.vercel.app'
  ).replace(/\/$/, '')
}

// Generate a Supabase recovery link for a freshly created user and email it via
// our own SMTP (lib/email). generateLink does not send any email by itself, so
// we are in full control of delivery. Errors are surfaced as warnings: the
// account already exists, the admin can re-send the email later if needed.
async function sendSetPasswordEmail(
  admin: ReturnType<typeof createAdminClient>,
  opts: { email: string; fullName?: string; roleLabel?: string },
) {
  try {
    const redirectTo = `${getAppUrl()}/auth/update-password`

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: opts.email,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[v0] Error generating set-password link:', linkError)
      return
    }

    const { sendEmail, emailTemplates } = await import('@/lib/email')
    const template = emailTemplates.setPassword({
      fullName: opts.fullName,
      email: opts.email,
      actionLink: linkData.properties.action_link,
      roleLabel: opts.roleLabel,
    })

    await sendEmail({ to: opts.email, subject: template.subject, html: template.html })
  } catch (emailError) {
    // Don't throw - the account is created; email delivery is best-effort.
    console.error('[v0] Error sending set-password email:', emailError)
  }
}

// Create a new client profile (admin/staff only)
export async function createClientProfile(data: {
  email: string
  full_name?: string
  company_name?: string
  phone?: string
}) {
  // Use the admin client (service role key) for Admin API + profile insert.
  const admin = createAdminClient()
  
  // Generate a temporary password
  const tempPassword = crypto.randomUUID().slice(0, 12) + 'Aa1!'
  
  // Create auth user using Supabase Admin API
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      full_name: data.full_name,
      company_name: data.company_name,
    }
  })

  if (authError) {
    console.error('[v0] Error creating auth user:', authError)
    throw new Error('Failed to create user: ' + authError.message)
  }

  // Upsert profile with the auth user's ID. A DB trigger may already have
  // created a row for the new auth user, so we upsert (on conflict id) to
  // avoid a duplicate key error and fill in the full details.
  const { data: client, error } = await admin
    .from('profiles')
    .upsert({
      id: authUser.user.id,
      email: data.email,
      full_name: data.full_name || null,
      company_name: data.company_name || null,
      phone: data.phone || null,
      role: 'client'
    }, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.error('[v0] Error creating client profile:', error)
    // Try to delete auth user if profile creation fails
    await admin.auth.admin.deleteUser(authUser.user.id)
    throw new Error('Failed to create client: ' + error.message)
  }

  // Generate a real Supabase recovery link and email it via our own SMTP so the
  // user can set their own password. generateLink does NOT send any email itself.
  await sendSetPasswordEmail(admin, {
    email: data.email,
    fullName: data.full_name,
  })

  revalidatePath('/dashboard')
  return client as Profile
}

// Get all users (admin only)
export async function getAllUsers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v0] Error fetching users:', error)
    return []
  }
  return data as Profile[]
}

// Update user role (admin only)
export async function updateUserRole(userId: string, role: 'admin' | 'staff' | 'client') {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error updating user role:', error)
    throw new Error('Failed to update user role: ' + error.message)
  }

  revalidatePath('/dashboard/users')
  return data as Profile
}

// Create staff member (admin only)
export async function createStaffMember(data: {
  email: string
  full_name?: string
  phone?: string
  role: 'staff' | 'admin'
}) {
  // Use the admin client (service role key) for Admin API + profile insert.
  const admin = createAdminClient()
  
  // Generate a temporary password
  const tempPassword = crypto.randomUUID().slice(0, 12) + 'Aa1!'
  
  // Create auth user using Supabase Admin API
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: data.full_name,
    }
  })

  if (authError) {
    console.error('[v0] Error creating auth user:', authError)
    throw new Error('Failed to create user: ' + authError.message)
  }

  // Upsert (on conflict id) in case a DB trigger already created the profile row.
  const { data: staff, error } = await admin
    .from('profiles')
    .upsert({
      id: authUser.user.id,
      email: data.email,
      full_name: data.full_name || null,
      phone: data.phone || null,
      role: data.role
    }, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.error('[v0] Error creating staff profile:', error)
    await admin.auth.admin.deleteUser(authUser.user.id)
    throw new Error('Failed to create staff member: ' + error.message)
  }

  // Generate a real Supabase recovery link and email it via our own SMTP.
  await sendSetPasswordEmail(admin, {
    email: data.email,
    fullName: data.full_name,
    roleLabel: data.role === 'admin' ? 'Quản trị viên' : 'Nhân viên',
  })

  revalidatePath('/dashboard/users')
  return staff as Profile
}

// Delete user (admin only)
export async function deleteUser(userId: string) {
  // The Admin API (deleteUser) requires the service role key, so use the admin client.
  const admin = createAdminClient()
  
  // Delete profile first
  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId)

  if (profileError) {
    console.error('[v0] Error deleting profile:', profileError)
    throw new Error('Failed to delete user profile: ' + profileError.message)
  }

  // Delete auth user
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  
  if (authError) {
    console.error('[v0] Error deleting auth user:', authError)
    // Profile is already deleted, log but don't throw
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}

// Get activity logs for a service
export async function getActivityLogs(serviceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activity_logs')
    .select(`
      *,
      user:profiles!activity_logs_user_id_fkey(full_name, email)
    `)
    .eq('service_id', serviceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[v0] Error fetching activity logs:', error)
    return []
  }
  return data
}

// Sign out
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/')
}

// Get monthly statistics for services
export interface MonthlyStats {
  month: string // YYYY-MM format
  monthLabel: string // Vietnamese month label
  total: number
  food: number
  cosmetics: number
  medical_device: number
  completed: number
  inProgress: number
}

export async function getMonthlyStatistics(year?: number): Promise<MonthlyStats[]> {
  const supabase = await createClient()
  const targetYear = year || new Date().getFullYear()
  
  // Fetch all services for the year
  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`
  
  const { data, error } = await supabase
    .from('services')
    .select('id, created_at, service_type, current_stage')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[v0] Error fetching monthly stats:', error)
    return []
  }

  // Vietnamese month labels
  const monthLabels = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ]

  // Initialize stats for all 12 months
  const monthlyStats: MonthlyStats[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${targetYear}-${String(i + 1).padStart(2, '0')}`,
    monthLabel: monthLabels[i],
    total: 0,
    food: 0,
    cosmetics: 0,
    medical_device: 0,
    completed: 0,
    inProgress: 0,
  }))

  // Aggregate data by month
  data?.forEach((service) => {
    const createdDate = new Date(service.created_at)
    const monthIndex = createdDate.getMonth()
    
    monthlyStats[monthIndex].total++
    
    // Count by service type
    if (service.service_type === 'food') {
      monthlyStats[monthIndex].food++
    } else if (service.service_type === 'cosmetics') {
      monthlyStats[monthIndex].cosmetics++
    } else if (service.service_type === 'medical_device') {
      monthlyStats[monthIndex].medical_device++
    }
    
    // Count completed vs in progress
    if (service.current_stage === 'completion_handover' || service.current_stage === 'renewal_support') {
      monthlyStats[monthIndex].completed++
    } else {
      monthlyStats[monthIndex].inProgress++
    }
  })

  return monthlyStats
}

// Get yearly overview statistics
export interface YearlyOverview {
  year: number
  totalServices: number
  totalCompleted: number
  totalInProgress: number
  byServiceType: {
    food: number
    cosmetics: number
    medical_device: number
  }
  byStage: Record<string, number>
  avgServicesPerMonth: number
  peakMonth: string
  peakMonthCount: number
}

export async function getYearlyOverview(year?: number): Promise<YearlyOverview> {
  const supabase = await createClient()
  const targetYear = year || new Date().getFullYear()
  
  const startDate = `${targetYear}-01-01`
  const endDate = `${targetYear}-12-31`
  
  const { data, error } = await supabase
    .from('services')
    .select('id, created_at, service_type, current_stage')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  if (error) {
    console.error('[v0] Error fetching yearly overview:', error)
    return {
      year: targetYear,
      totalServices: 0,
      totalCompleted: 0,
      totalInProgress: 0,
      byServiceType: { food: 0, cosmetics: 0, medical_device: 0 },
      byStage: {},
      avgServicesPerMonth: 0,
      peakMonth: '',
      peakMonthCount: 0,
    }
  }

  const monthLabels = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
  ]

  const monthCounts = Array(12).fill(0)
  const byServiceType = { food: 0, cosmetics: 0, medical_device: 0 }
  const byStage: Record<string, number> = {}
  let totalCompleted = 0
  let totalInProgress = 0

  data?.forEach((service) => {
    const monthIndex = new Date(service.created_at).getMonth()
    monthCounts[monthIndex]++
    
    // Count by type
    if (service.service_type in byServiceType) {
      byServiceType[service.service_type as keyof typeof byServiceType]++
    }
    
    // Count by stage
    byStage[service.current_stage] = (byStage[service.current_stage] || 0) + 1
    
    // Count completed/in progress
    if (service.current_stage === 'completion_handover' || service.current_stage === 'renewal_support') {
      totalCompleted++
    } else {
      totalInProgress++
    }
  })

  // Find peak month
  const maxCount = Math.max(...monthCounts)
  const peakMonthIndex = monthCounts.indexOf(maxCount)

  return {
    year: targetYear,
    totalServices: data?.length || 0,
    totalCompleted,
    totalInProgress,
    byServiceType,
    byStage,
    avgServicesPerMonth: data?.length ? Math.round((data.length / 12) * 10) / 10 : 0,
    peakMonth: maxCount > 0 ? monthLabels[peakMonthIndex] : 'N/A',
    peakMonthCount: maxCount,
  }
}

// Get available years for statistics
export async function getAvailableYears(): Promise<number[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('services')
    .select('created_at')
    .order('created_at', { ascending: true })

  if (error || !data?.length) {
    return [new Date().getFullYear()]
  }

  const years = new Set<number>()
  data.forEach((service) => {
    years.add(new Date(service.created_at).getFullYear())
  })

  return Array.from(years).sort((a, b) => b - a)
}
